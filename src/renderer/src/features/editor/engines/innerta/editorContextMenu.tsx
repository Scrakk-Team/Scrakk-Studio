/**
 * Menú contextual del EDITOR — usa el ContextMenu GLOBAL de Scrakk (@ui).
 *
 * Acciones básicas: Copiar · Pegar · Seleccionar todo · Formatear
 * Acción avanzada: Ir a definición (abre el archivo destino en tab).
 *
 * TODO es POR ENGINE: recibe el module (InnertaModule) y el path del engine
 * donde se clickeó. Así cada instancia (archivo multi-editor) ejecuta sus
 * acciones de clipboard/formato en SU módulo y con SU ruta — nada de
 * singletons globales (`window.__scrakkInnerta` / activePath) que con varios
 * engines apuntaban al módulo/archivo equivocado.
 *
 * Los combos al engine replican el flujo del TECLADO (innertaInput): Pegar
 * PRECARGA el clipboard del engine (SetInnertaWasmClipboard) antes de la
 * tecla — sin eso el engine pega su clipboard interno (vacío/viejo) y el
 * botón "no hace nada".
 */

import type { ContextMenuItem } from '@ui'
import type { InnertaModule } from './InnertaEngine'
import { showContextMenu } from './menuHost'
import { lspGoToDefinition, lspFormatting, lspNotifyFileChanged } from '@services/lsp'
import { getDocumentEncoding } from '@services/encodings'
import { notify } from '@services/notifications'
import { openFileInEditor } from '@features/editor'
import { goToDefinitionFromTree } from '@features/editor/treeNavigation'

// GLFW: C=67, V=86, A=65; mods: ctrl=0x02
const GLFW_KEY_C = 67
const GLFW_KEY_V = 86
const GLFW_KEY_A = 65
const GLFW_MOD_CTRL = 0x02

/** Ejecuta un "atajo" DENTRO del engine dado (mismo camino que el teclado). */
function sendEngineCombo(module: InnertaModule | null, combo: { key: number; mods: number }): void {
  module?.key(combo.key, 1, combo.mods)
}

/** Copia la selección del engine al portapapeles del sistema. */
function copyFromEngine(module: InnertaModule | null): void {
  const text = module?.getSelectedText?.() ?? ''
  if (!text) return
  void navigator.clipboard?.writeText(text).catch(() => {
    // Fallback: el engine también escribe el clipboard por su cuenta (EM_ASM).
    sendEngineCombo(module, { key: GLFW_KEY_C, mods: GLFW_MOD_CTRL })
  })
}

/** Pega: precarga el clipboard del navegador en el engine y entrega Ctrl+V. */
function pasteIntoEngine(module: InnertaModule | null): void {
  if (!module) return
  navigator.clipboard
    ?.readText()
    .then((text) => {
      module.setWasmClipboard?.(text)
      sendEngineCombo(module, { key: GLFW_KEY_V, mods: GLFW_MOD_CTRL })
    })
    .catch(() => {
      // Sin permiso de lectura: la tecla va igual (clipboard interno previo).
      sendEngineCombo(module, { key: GLFW_KEY_V, mods: GLFW_MOD_CTRL })
    })
}

/** Posición documento (0-based) para LSP: click si hay hit, si no el cursor. */
function positionForLsp(
  module: InnertaModule | null,
  local?: { x: number; y: number }
): { line: number; col: number } {
  if (module && local) {
    const hit = module.hitTest?.(local.x, local.y)
    if (hit && hit.line >= 0) return hit
  }
  const cursor = module?.getCursor?.()
  if (cursor) return cursor
  return { line: 0, col: 0 }
}

async function goToDefinition(
  path: string,
  module: InnertaModule | null,
  local?: { x: number; y: number }
): Promise<void> {
  const { line, col } = positionForLsp(module, local)
  // Primero el ÁRBOL: si el lenguaje trae `locals.scm`, resuelve en memoria y
  // respeta ámbitos (el parámetro y no la primera coincidencia del archivo).
  // El LSP queda como respaldo para los lenguajes sin query de locales.
  if (await goToDefinitionFromTree({ line, col })) return
  const locations = await lspGoToDefinition(path, line, col)
  const first = locations[0]
  if (!first) {
    notify({ title: 'Ir a definición', message: 'Sin definición encontrada en el cursor.', severity: 'info' })
    return
  }
  const targetPath = decodeURIComponent(first.uri.replace(/^file:\/\//, ''))
  openFileInEditor(targetPath, targetPath.split(/[/\\]/).pop() ?? targetPath)
}

// ── Formateo: aplicar TextEdits del LSP sobre el buffer ─────────────────────

interface RangeEdit {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  newText: string
}

/** LSP line/character (UTF-16) → offset en un string JS (UTF-16 nativo). */
function lineStartsOf(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function offsetAt(starts: number[], text: string, line: number, character: number): number | null {
  if (!Number.isInteger(line) || !Number.isInteger(character)) return null
  if (line < 0 || line >= starts.length) return null
  const lineStart = starts[line]
  const lineEnd = line + 1 < starts.length ? starts[line + 1] - 1 : text.length
  return Math.min(lineStart + Math.max(0, character), lineEnd)
}

/**
 * Aplica TextEdits (posiciones sobre el TEXTO ORIGINAL) bottom-up. Devuelve
 * null si los edits son inválidos/solapados — en ese caso no se toca nada.
 */
function applyTextEdits(text: string, edits: RangeEdit[]): string | null {
  const starts = lineStartsOf(text)
  type Positioned = { start: number; end: number; newText: string }
  const positioned: Positioned[] = []
  for (const edit of edits) {
    const start = offsetAt(starts, text, edit.range?.start?.line ?? -1, edit.range?.start?.character ?? -1)
    const end = offsetAt(starts, text, edit.range?.end?.line ?? -1, edit.range?.end?.character ?? -1)
    if (start === null || end === null || end < start || typeof edit.newText !== 'string') return null
    positioned.push({ start, end, newText: edit.newText })
  }
  positioned.sort((a, b) => b.start - a.start || b.end - a.end)
  let out = text
  let lastStart = Number.POSITIVE_INFINITY
  for (const p of positioned) {
    if (p.end > lastStart) return null
    out = out.slice(0, p.start) + p.newText + out.slice(p.end)
    lastStart = p.start
  }
  return out
}

/**
 * Formatea el documento: pide TextEdits al LSP, los aplica sobre el texto
 * con el EOL del doc (las posiciones del server son sobre SU texto) y
 * reemplaza el buffer. Trade-off: SetText resetea el undo del engine —
 * el formateo es una acción deliberada, se asume.
 */
async function formatDocument(path: string, module: InnertaModule | null): Promise<void> {
  if (!module) return
  const text = module.getText?.()
  if (typeof text !== 'string') {
    notify({ title: 'Formatear', message: 'Buffer no disponible todavía.', severity: 'warn' })
    return
  }

  const results = await lspFormatting(path)
  const rawEdits = results[0]?.edits
  if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
    notify({ title: 'Formatear', message: 'El LSP no devolvió ediciones.', severity: 'info' })
    return
  }

  // El server formateó sobre el texto CON el EOL del documento: reconstruir
  // ese texto para que las posiciones caigan donde corresponde (SetText del
  // engine stripsea los \r, así que re-alimentar CRLF es seguro).
  const eol = getDocumentEncoding(path)?.lineEnding === 'CRLF' ? '\r\n' : '\n'
  const serverText = text.split('\n').join(eol)

  const applied = applyTextEdits(serverText, rawEdits as RangeEdit[])
  if (applied === null) {
    notify({ title: 'Formatear', message: 'Ediciones del LSP inválidas o solapadas — no se aplicó nada.', severity: 'warn' })
    return
  }
  if (applied === serverText) {
    notify({ title: 'Formatear', message: 'El documento ya está formateado.', severity: 'info' })
    return
  }

  module.setContent(applied)
  void lspNotifyFileChanged(path, applied)
  notify({ title: 'Formatear', message: 'Documento formateado.', severity: 'success' })
}

export function openEditorContextMenu(
  module: InnertaModule | null,
  path: string | null,
  clientX: number,
  clientY: number,
  /** Coords canvas-locales del click (para hit-test → posición LSP real). */
  local?: { x: number; y: number }
): void {
  const items: ContextMenuItem[] = [
    {
      label: 'Copiar',
      disabled: !module,
      onClick: () => copyFromEngine(module)
    },
    {
      label: 'Pegar',
      disabled: !module,
      onClick: () => pasteIntoEngine(module)
    },
    {
      label: 'Seleccionar todo',
      separatorBefore: true,
      disabled: !module,
      onClick: () => sendEngineCombo(module, { key: GLFW_KEY_A, mods: GLFW_MOD_CTRL })
    },
    {
      label: 'Ir a definición',
      disabled: !path,
      onClick: () => void goToDefinition(path!, module, local)
    },
    {
      label: 'Formatear documento',
      disabled: !path || !module,
      onClick: () => void formatDocument(path!, module)
    }
  ]

  showContextMenu(clientX, clientY, items)
}

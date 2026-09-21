/**
 * Innerta host bridge — POR ENGINE (una instancia por módulo WASM).
 *
 * Con multi-editor + terminales hay N módulos Innerta vivos a la vez (cada
 * sesión de archivo y cada terminal son un módulo aislado). El bridge no
 * puede ser global: los hooks C++ (`_innertaOnContextMenu`,
 * `_innertaOnCursorChanged`) viven en la instancia `Module` de CADA módulo,
 * así que este módulo crea UN bridge por engine, atado a su propio raw +
 * canvas + path. Así:
 *
 *  - El cursor (Ln/Col) lo empuja el engine con el que se está
 *    interactuando (sus hooks están en SU instancia, no pisados por otra).
 *  - El click derecho abre el menú del engine clickeado, con SU path
 *    (hover LSP / ir a definición / formatear no apuntan a otro archivo).
 *
 * HOVER: dwell 100% del lado JS (timers confiables). Al estabilizar el
 * cursor 350 ms sobre el canvas → hit-test al engine (InnertaHitTest) →
 * lspHover → TooltipHost (API global). Nada depende de eventos C++.
 *
 * CONTEXT MENU: click derecho → menú del engine. Doble camino: DOM
 * contextmenu (garantizado) + EM_JS desde C++ (secundario).
 */

import type { InnertaModule } from './InnertaEngine'
import { getInnertaRawModule } from './innertaLoader'
import { diagnosticHoverText, diagnosticsAt, hoverContentsToText, lspGoToDefinition, lspHover } from '@services/lsp'
import { showTooltip, hideTooltip } from '@services/tooltips'
import { setDecorations, themeColor } from '@services/decorations'
import { openEditorContextMenu } from './editorContextMenu'
import { setEditorCursor } from '../../cursorBus'
import { getFileSessionText } from '../../fileSession'
import { applyEngineBookmark } from '@services/bookmarks'
import {
  goToDefinitionTarget,
  hasLspSymbolName,
  knowsLspSymbolNames,
  primeLspSymbolNames,
  resolveDefinitionTarget,
  resolveTreeTargetFromBuffer,
  wordRangeAt
} from '../../definitionNavigation'
import { wordAt } from '../../treeNavigationLogic'

/**
 * Tipos del canal ÚNICO de eventos engine→host (HostEvent en HostBridge.h).
 * El engine emite todo por Module._innertaOnEvent(type, a, b, c) — ints
 * puros, sin marshalling. Agregar un evento = 1 entrada aquí + 1 case.
 */
export const InnertaHostEvent = {
  ContextMenu: 1,
  CursorChanged: 2,
  RevisionChanged: 3,
  BookmarkToggled: 4
} as const

/** Bridge de UN engine. El engine llama setPath/syncCursor y dispose al destruirse. */
export interface InnertaBridge {
  /** Path del archivo que carga ESTE engine (para hover LSP / menú). */
  setPath(path: string | null): void
  /** Empuja el cursor actual de ESTE engine al bus (tab activada / archivo abierto). */
  syncCursor(): void
  /** Desconecta hooks C++ + listeners DOM de este engine. */
  dispose(): void
}

function canvasOf(host: HTMLElement): HTMLCanvasElement | null {
  return host.querySelector<HTMLCanvasElement>('.scrakk-innerta-canvas')
}

/**
 * Raw instance de un módulo. Cada módulo aislado guarda su propio raw en
 * `_rawModuleRef` (ver innertaLoader.wrapIsolated); el módulo compartido
 * legacy cae al raw global (uno solo). Nunca mezclar instancias.
 */
function rawOf(module: InnertaModule | null): Record<string, unknown> | null {
  if (!module) return null
  const own = (module as unknown as { _rawModuleRef?: Record<string, unknown> })._rawModuleRef
  return own ?? getInnertaRawModule()
}

const HOVER_DWELL_MS = 120

// ── Registro de engines VIVOS (para actuar sobre el editor activo) ─────────
//
// Lo necesita cualquier funcionalidad que quiera mover CURSOR o empujar datos
// a un editor concreto desde fuera de su React tree: el outline (ir a la línea
// del símbolo), “ir a la definición” resuelto con el árbol y los rangos de
// plegado (`folds.scm`). El bridge es la única pieza que ya sabe, por
// instancia, cuál es SU path y SU módulo.
interface LiveEngineEntry {
  getModule: () => InnertaModule | null
  path: string | null
}

const liveEngines = new Set<LiveEngineEntry>()

/**
 * El engine de un archivo: por path exacto y, si no hay, el único vivo.
 *
 * Con varios editores abiertos NO se adivina (devolver el equivocado movería el
 * cursor de otro archivo): sin coincidencia exacta y con más de uno vivo, no
 * hay engine.
 */
function engineFor(path: string | null | undefined): LiveEngineEntry | null {
  const live = [...liveEngines]
  if (path) {
    const exact = live.find((entry) => entry.path === path)
    if (exact) return exact
  }
  return live.length === 1 ? live[0] : null
}

/**
 * Mueve el cursor del editor de `path` a una posición (0-based).
 *
 * Devuelve `false` si no hay engine vivo para ese archivo — el llamador decide
 * qué hacer (avisar, o abrir la tab primero).
 */
export function revealInnertaPosition(path: string | null | undefined, line: number, col: number): boolean {
  const entry = engineFor(path)
  const mod = entry?.getModule()
  if (!mod || typeof mod.setCursor !== 'function') return false
  if (!Number.isFinite(line) || !Number.isFinite(col)) return false
  try {
    mod.setCursor(Math.max(0, Math.floor(line)), Math.max(0, Math.floor(col)))
    mod.setFocus?.(true)
    return true
  } catch {
    return false
  }
}

/**
 * Selecciona un RANGO exacto en el editor de `path` (0-based, ancla + activo).
 *
 * Lo usa “expandir selección”: el rango sale del árbol (`textobjects.scm`), así
 * que es el objeto real y no una aproximación por teclado.
 */
export function applyInnertaSelection(
  path: string | null | undefined,
  anchorLine: number,
  anchorCol: number,
  activeLine: number,
  activeCol: number
): boolean {
  const entry = engineFor(path)
  const mod = entry?.getModule()
  if (!mod || typeof mod.setSelection !== 'function') return false
  try {
    mod.setSelection(
      Math.max(0, Math.floor(anchorLine)),
      Math.max(0, Math.floor(anchorCol)),
      Math.max(0, Math.floor(activeLine)),
      Math.max(0, Math.floor(activeCol))
    )
    mod.setFocus?.(true)
    return true
  } catch {
    return false
  }
}

/**
 * Empuja los rangos plegables del host al editor de `path` (tripletes
 * `(startLine, endLine, kind)`; un array vacío devuelve el plegado por sangría).
 *
 * Devuelve si el MOTOR tiene ahora esos rangos, no si la llamada no lanzó.
 *
 * La diferencia importa: `setFoldingRanges` es `void`, así que anteponerle un
 * `try/catch` convierte "no explotó" en "funcionó", que es exactamente el tipo
 * de verde falso que hace buscar el bug donde no está. El motor expone su
 * contador (`GetInnertaFoldingCount`) y desde aquí se COMPARA con lo pedido; en
 * un build sin el getter se cae al comportamiento viejo (no hay dato, no se
 * inventa uno).
 */
export function applyInnertaFolds(path: string | null | undefined, ranges: number[]): boolean {
  const entry = engineFor(path)
  const mod = entry?.getModule()
  if (!mod || typeof mod.setFoldingRanges !== 'function') return false
  try {
    mod.setFoldingRanges(ranges)
  } catch {
    return false
  }

  const expected = Math.floor(ranges.length / 3)
  const state = innertaFoldsState(path)
  if (!state || state.count < 0) return true
  // Lista vacía = "delegá el plegado": el motor tendrá SUS rangos (el `folds.scm`
  // del lenguaje embebido o, sin él, la indentación), así que no hay conteo que
  // comparar. Lo verificable —y lo que importa— es que ya no estén los MÍOS.
  if (expected === 0) return !state.fromHost || state.fromEngine
  return state.count === expected && state.fromHost
}

/**
 * Estado del plegado del editor de `path`, según el propio motor.
 *
 * `count` es `-1` cuando el build del WASM no expone el getter: se distingue
 * "no sé" de "cero rangos", que en diagnóstico es la diferencia entre buscar
 * un bug del host y uno del motor.
 */
export function innertaFoldsState(
  path: string | null | undefined
): { count: number; fromHost: boolean; fromEngine: boolean } | null {
  const entry = engineFor(path)
  const mod = entry?.getModule()
  if (!mod || typeof mod.getFoldingCount !== 'function') return null
  try {
    return {
      count: mod.getFoldingCount(),
      fromHost: mod.foldingIsHost?.() ?? false,
      // "No es indentación" tiene DOS causas desde que el motor lee su propio
      // `folds.scm`: gramática dinámica del host o query del lenguaje embebido.
      fromEngine: mod.foldingFromEngine?.() ?? false
    }
  } catch {
    return null
  }
}

export function attachHostBridge(
  getModule: () => InnertaModule | null,
  getHost: () => HTMLElement | null,
  /** Eventos RevisionChanged del canal único (buffer mutado → dirty). */
  onRevision?: (revision: number) => void
): InnertaBridge {
  const hostEl = getHost()
  if (!hostEl) return noopBridge()

  const canvas = canvasOf(hostEl) ?? hostEl
  const raw = rawOf(getModule())
  // Cursor base del editor: I-beam (parece que detecta texto). El bridge lo
  // pisa a `pointer` sobre un símbolo con definición y lo restaura acá.
  canvas.style.cursor = 'text'

  // Path de ESTE engine — setPath() lo actualiza (NO es global).
  let activePath: string | null = null
  let disposed = false
  // Alta en el registro de engines vivos: es lo que permite que el outline,
  // “ir a la definición” y el plegado encuentren al editor de un archivo.
  const entry: LiveEngineEntry = { getModule, path: null }
  liveEngines.add(entry)

  // ── Hover: dwell JS + hit-test del engine ────────────────────────────────
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let hideDelay: ReturnType<typeof setTimeout> | undefined

  const clearTimers = (): void => {
    if (hoverTimer) clearTimeout(hoverTimer)
    hoverTimer = undefined
    if (hideDelay) clearTimeout(hideDelay)
    hideDelay = undefined
  }

  const hideNow = (): void => {
    clearTimers()
    hideTooltip()
  }

  const showTooltipFor = (line: number, col: number, clientX: number, clientY: number): void => {
    const path = activePath
    if (!path || line < 0) return
    void lspHover(path, line, col).then((results) => {
      if (disposed) return
      // `contents` puede venir como string, `MarkupContent` o ARRAY de los dos
      // (el API de VS Code acepta las tres y los servers las usan): aplanarlas
      // aquí es la diferencia entre mostrar el hover y un tooltip vacío.
      const texts = results
        .map((r) => hoverContentsToText(r.contents))
        .filter((text) => text.length > 0)
      // Diagnóstico BAJO el puntero: en VS Code el hover sobre el subrayado
      // muestra el mensaje del problema, y va ARRIBA del hover del lenguaje
      // ("esto está mal" es más urgente que "esto es un string"). Sin esto, el
      // usuario ve la ondulación y tiene que ir al panel a averiguar qué dice.
      const problems = diagnosticsAt(path, line, col)
        .map(diagnosticHoverText)
        .filter((text) => text.length > 0)
      if (texts.length === 0 && problems.length === 0) return
      showTooltip({
        text: [...problems, ...texts].join('\n\n———\n\n'),
        // El hover LSP es markdown (el server ya lo manda así: contentFormat
        // ['plaintext','markdown'] se negocia en initialize).
        markdown: true,
        clientX,
        clientY: clientY - 10
      })
    })
  }

  // ── Definición (hover con Ctrl/Cmd + click) + cursor ─────────────────────
  const DEFINITION_SOURCE = 'definition-hover'
  let ctrlHeld = false
  let definitionKey = ''
  let definitionToken = 0
  let lastOverText = true
  let cursorState: 'text' | 'default' | 'pointer' = 'text'

  /** Cursor del canvas: I-beam sobre el texto, flecha en el gutter/afuera. */
  const setCursor = (state: 'text' | 'default' | 'pointer'): void => {
    if (cursorState === state) return
    cursorState = state
    canvas.style.cursor = state
  }

  const clearDefinitionUnderline = (): void => {
    definitionKey = ''
    definitionToken++
    if (activePath) setDecorations(DEFINITION_SOURCE, activePath, [])
  }

  const paintDefinition = (path: string, line: number, startCol: number, endCol: number): void => {
    setDecorations(DEFINITION_SOURCE, path, [
      {
        startLine: line,
        startCol,
        endLine: line,
        endCol,
        color: themeColor('--color-accent', '#3794ff'),
        style: 'underline'
      }
    ])
    setCursor('pointer')
  }

  /**
   * Subraya el símbolo bajo (line,col) si tiene definición. Se llama EN CADA
   * pointermove (sin timers): el árbol resuelve síncrono desde el buffer vivo y
   * pinta al instante; el LSP se pide ya y se descarta si el símbolo cambió.
   */
  const underlineDefinition = (line: number, col: number): void => {
    const path = activePath
    if (!path) return
    const text = getFileSessionText(path)
    const range = typeof text === 'string' ? wordRangeAt(text, line, col) : null
    if (typeof text !== 'string' || !range) {
      clearDefinitionUnderline()
      setCursor(lastOverText ? 'text' : 'default')
      return
    }

    // 1) Árbol en memoria: instantáneo.
    if (resolveTreeTargetFromBuffer(path, line, col)) {
      paintDefinition(path, line, range.startCol, range.endCol)
      return
    }

    // 2) Símbolos del LSP ya prefetcheados: existencia instantánea.
    const name = wordAt(text, line, col)
    if (hasLspSymbolName(path, name)) {
      paintDefinition(path, line, range.startCol, range.endCol)
      return
    }
    // Si todavía no se prefetcheó, se dispara (y este hover cae al LSP).
    if (!knowsLspSymbolNames(path)) primeLspSymbolNames(path)

    // 3) LSP: asincrónico; se pinta solo si el símbolo sigue siendo el mismo.
    const token = ++definitionToken
    const expectedKey = `${line}:${col}`
    void lspGoToDefinition(path, line, col)
      .then((locations) => {
        if (disposed || token !== definitionToken || definitionKey !== expectedKey) return
        if (!locations[0]) {
          clearDefinitionUnderline()
          setCursor(lastOverText ? 'text' : 'default')
          return
        }
        paintDefinition(path, line, range.startCol, range.endCol)
      })
      .catch(() => {
        /* el server no respondió: se deja como está */
      })
  }

  const onDefinitionKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Control' || event.key === 'Meta') ctrlHeld = true
  }

  const onDefinitionKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Control' || event.key === 'Meta') {
      ctrlHeld = false
      clearDefinitionUnderline()
      setCursor(lastOverText ? 'text' : 'default')
    }
  }

  const onDefinitionBlur = (): void => {
    ctrlHeld = false
    clearDefinitionUnderline()
    setCursor('text')
  }

  window.addEventListener('keydown', onDefinitionKeyDown)
  window.addEventListener('keyup', onDefinitionKeyUp)
  window.addEventListener('blur', onDefinitionBlur)

  const onPointerMove = (event: PointerEvent): void => {
    // Movimiento real → cancelar hover pendiente y esconder el visible.
    clearTimers()

    const mod = getModule()
    if (disposed || !mod?.hitTest) return
    const rect = canvas.getBoundingClientRect()
    const localX = Math.round(event.clientX - rect.left)
    const localY = Math.round(event.clientY - rect.top)
    const hit = mod.hitTest(localX, localY)
    // El texto arranca en `textXOffset`; todo lo de su izquierda es el gutter.
    // Si el WASM no expone el offset (viejo), se cae al criterio de línea.
    const textX = mod.getTextXOffset?.() ?? null
    const overText = hit.line >= 0 && (textX === null || localX + 0.5 >= textX)
    lastOverText = overText

    // Con Ctrl/Cmd apretado el comportamiento es el de un editor: subrayar el
    // símbolo y dejar el puntero listo para el click. Sin tooltip.
    if (ctrlHeld) {
      if (!overText) {
        clearDefinitionUnderline()
        setCursor('default')
        return
      }
      const key = `${hit.line}:${hit.col}`
      if (key !== definitionKey) {
        definitionKey = key
        underlineDefinition(hit.line, hit.col)
      }
      return
    }

    clearDefinitionUnderline()
    setCursor(overText ? 'text' : 'default')
    if (!overText) return

    hoverTimer = setTimeout(() => {
      if (disposed) return
      const current = getModule()
      if (!current?.hitTest) return
      const fresh = current.hitTest(localX, localY)
      if (fresh.line < 0) return
      showTooltipFor(fresh.line, fresh.col, event.clientX, event.clientY)
    }, HOVER_DWELL_MS)
  }

  const onPointerLeave = (): void => {
    clearTimers()
    clearDefinitionUnderline()
    setCursor('text')
    // Delay: si el tooltip markdown es interactivo (scroll de tablas/código),
    // dejar entrar el puntero antes de matarlo.
    hideDelay = setTimeout(hideTooltip, 300)
  }

  // Click en el canvas: ocultar hover y refrescar el cursor al instante
  // (el engine ya empuja por hook al moverse el cursor; aquí se adelanta).
  const onPointerDown = (event: PointerEvent): void => {
    hideNow()
    const mod = getModule()
    // Ctrl/Cmd + click: ir a la definición (no mueve el caret).
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      const path = activePath
      if (!path || !mod?.hitTest) return
      const rect = canvas.getBoundingClientRect()
      const hit = mod.hitTest(
        Math.round(event.clientX - rect.left),
        Math.round(event.clientY - rect.top)
      )
      if (hit.line < 0) return
      clearDefinitionUnderline()
      void resolveDefinitionTarget(path, { line: hit.line, col: hit.col }).then((target) => {
        if (!disposed && target) goToDefinitionTarget(target)
      })
      return
    }
    if (!mod || typeof mod.getCursor !== 'function') return
    const cursor = mod.getCursor()
    if (cursor) setEditorCursor(cursor)
  }

  const onContext = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    openEditorContextMenu(getModule(), activePath, event.clientX, event.clientY)
  }

  canvas.addEventListener('pointermove', onPointerMove, { passive: true })
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('contextmenu', onContext)

  // ── Camino C++ (EM_JS): canal ÚNICO de eventos de ESTE raw ──────────────
  // Hot path (cursor): dispatch síncrono directo a cursorBus — igual que el
  // hook dedicado anterior, solo con un switch de por medio (sin allocs).
  type InnertaHooks = {
    _innertaOnEvent?: (type: number, a: number, b: number, c: number) => void
  }
  const hooks = raw as InnertaHooks | null
  if (hooks) {
    hooks._innertaOnEvent = (type, a, b) => {
      if (disposed) return
      switch (type) {
        case InnertaHostEvent.ContextMenu: {
          const rect = canvas.getBoundingClientRect()
          // `a`/`b` son coords canvas-locales (el C++ emite mx/my).
          openEditorContextMenu(getModule(), activePath, rect.left + a, rect.top + b)
          break
        }
        case InnertaHostEvent.BookmarkToggled: {
          // Click en el gutter del engine → espejar en la store persistida.
          // El re-push posterior (store→engine) es idempotente: mismo set.
          if (activePath && Number.isFinite(a) && a >= 0) {
            applyEngineBookmark(activePath, a, b === 1)
          }
          break
        }
        case InnertaHostEvent.CursorChanged: {
          if (!Number.isFinite(a) || !Number.isFinite(b)) return
          if (a < 0 || b < 0) return
          setEditorCursor({ line: a, col: b })
          break
        }
        case InnertaHostEvent.RevisionChanged: {
          // uint32 viajó como int32: reinterpretar por bits (>>> 0).
          onRevision?.(a >>> 0)
          break
        }
      }
    }
  }

  return {
    setPath(path: string | null): void {
      activePath = path
      entry.path = path
      // Prefetchea los símbolos del archivo para que el hover sea instantáneo.
      if (path) primeLspSymbolNames(path)
    },
    syncCursor(): void {
      const mod = getModule()
      if (disposed || !mod || typeof mod.getCursor !== 'function') return
      const cursor = mod.getCursor()
      if (cursor) setEditorCursor(cursor)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      liveEngines.delete(entry)
      hideNow()
      clearDefinitionUnderline()
      window.removeEventListener('keydown', onDefinitionKeyDown)
      window.removeEventListener('keyup', onDefinitionKeyUp)
      window.removeEventListener('blur', onDefinitionBlur)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('contextmenu', onContext)
      if (hooks) {
        hooks._innertaOnEvent = undefined
      }
    }
  }
}

function noopBridge(): InnertaBridge {
  return { setPath: () => {}, syncCursor: () => {}, dispose: () => {} }
}

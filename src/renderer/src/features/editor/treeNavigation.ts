/**
 * Navegación por el ÁRBOL de sintaxis, sin language server.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ RESUELVE (y por qué no es el LSP)
 *
 * Un paquete SEF puede traer `locals.scm` y `textobjects.scm`, y esos dos datos
 * alcanzan para dos cosas que hasta ahora exigían un server:
 *
 *   1. **Ir a la definición**: `locals.scm` marca definiciones y referencias y,
 *      con `@local.scope`, dice a qué ÁMBITO pertenece cada una. Eso permite
 *      resolver “esta `x` es la del parámetro de esta función” y no “la primera
 *      `x` del archivo” — que es el error clásico de hacerlo con grep.
 *   2. **Expandir selección**: `textobjects.scm` da los rangos reales de la
 *      función, la clase o el parámetro (`@function.inner`, `@class.outer`…),
 *      así que la selección crece al objeto del ÁRBOL y no a una aproximación
 *      por llaves.
 *
 * La DECISIÓN (qué palabra, a qué definición, a qué objeto) vive en
 * `treeNavigationLogic.ts`, que es pura y se testea. Aquí está lo que toca la
 * app: leer el archivo activo, pedir el cursor y mover el motor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LO QUE **NO** HACE
 *
 * No inventa resultados: si el lenguaje no tiene esas queries (o su extensión
 * no está instalada), avisa y —en el caso de la definición— devuelve `false`
 * para que el llamador use el camino del LSP. Un “ir a la definición” que salta
 * a cualquier lado es peor que uno que dice “no sé”.
 */

import { notify } from '@services/notifications'
import { getEditorFiles } from './editorBus'
import { getEditorCursor } from './cursorBus'
import { getDynamicSyntax } from '@services/extensions/dynamicSyntax'
import {
  applyInnertaSelection,
  revealInnertaPosition
} from './engines/innerta/hostBridge'
import { resolveTreeTarget } from './definitionNavigation'
import {
  nextTextObject,
  spanSize,
  type Span
} from './treeNavigationLogic'

/**
 * Comando “Ir a la definición” resuelto con el árbol.
 *
 * Devuelve `true` si navegó. `false` significa “el árbol no sabe”: el llamador
 * decide si cae al LSP. Delega en el resolutor compartido (`locals.scm` y
 * `tags.scm`) para no duplicar la lógica.
 */
export async function goToDefinitionFromTree(position?: {
  line: number
  col: number
}): Promise<boolean> {
  const { activePath } = getEditorFiles()
  if (!activePath) return false
  const cursor = position ?? getEditorCursor()
  if (!cursor) return false
  const target = await resolveTreeTarget(cursor)
  if (!target) return false
  return revealInnertaPosition(target.path, target.line, target.column)
}

/** Último rango al que se expandió la selección, por archivo. */
const lastExpansion = new Map<string, Span>()

/**
 * Comando “Expandir selección”: pasa al siguiente objeto de texto más grande.
 *
 * El primer paso toma el objeto más CHICO que contiene el cursor (el parámetro
 * antes que la función) y cada llamada sube al siguiente. Cuando ya no hay uno
 * más grande, avisa y se queda en el último.
 *
 * Se guarda el último rango por archivo porque el host no puede preguntarle al
 * motor la selección actual (el motor sólo devuelve el TEXTO seleccionado): sin
 * esa memoria, “expandir” volvería siempre al objeto más chico.
 */
export async function expandSelectionFromTree(): Promise<boolean> {
  const { activePath } = getEditorFiles()
  if (!activePath) return false
  const syntax = getDynamicSyntax(activePath)
  if (!syntax || syntax.textObjects.length === 0) {
    notify({
      title: 'Expandir selección',
      message: 'Este lenguaje no declara objetos de texto (textobjects.scm).',
      severity: 'info'
    })
    return false
  }

  const cursor = getEditorCursor() ?? { line: 0, col: 0 }
  const previous = lastExpansion.get(activePath) ?? null
  // El punto de referencia es el INICIO del rango anterior (si lo hay): así el
  // siguiente objeto tiene que contener lo que ya estaba seleccionado.
  const anchorPoint = previous
    ? { line: previous.startLine, column: previous.startColumn }
    : { line: cursor.line, column: cursor.col }

  const next = nextTextObject(syntax.textObjects, anchorPoint, previous)
  if (!next) {
    notify({
      title: 'Expandir selección',
      message: 'No hay un objeto de texto más grande.',
      severity: 'info'
    })
    return false
  }

  const span: Span = {
    startLine: next.startLine,
    startColumn: next.startColumn,
    endLine: next.endLine,
    endColumn: next.endColumn
  }
  lastExpansion.set(activePath, span)
  // El ancla va al FINAL y el activo al principio: la selección crece “hacia
  // atrás”, que es como se ve al expandir desde un cursor que estaba adentro.
  return applyInnertaSelection(
    activePath,
    span.endLine,
    span.endColumn,
    span.startLine,
    span.startColumn
  )
}

/** El archivo cambió de contenido: la expansión anterior ya no vale. */
export function resetSelectionExpansion(path?: string): void {
  if (path) lastExpansion.delete(path)
  else lastExpansion.clear()
}

/** Para diagnóstico/tests: tamaño del último rango expandido. */
export function lastExpansionSize(path: string): number {
  const span = lastExpansion.get(path)
  return span ? spanSize(span) : 0
}

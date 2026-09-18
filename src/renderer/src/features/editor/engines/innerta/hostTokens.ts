/**
 * Canal de tokens del host hacia el motor — el ÚNICO dueño.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN DUEÑO ÚNICO
 *
 * El motor tiene UN buffer de tokens (`SetInnertaSemanticTokens`). Si cada
 * fuente empujara por su cuenta, la última en llegar borraría a la otra: el LSP
 * (que se actualiza al guardar/abrir) y la gramática TextMate de una extensión
 * (que se recalcula al tipear) se pisarían en cada cambio.
 *
 * Entonces las fuentes no empujan: PUBLICAN acá (`setSourceTokens`) y este
 * módulo fusiona por prioridad (`mergeHostTokens`) y publica el resultado.
 * La prioridad ya está definida en el núcleo compartido — el LSP gana sobre la
 * gramática, la gramática sobre el árbol.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FUENTE DE RESALTADO
 *
 * - sin tokens del host → `0`: sólo tree-sitter embebido (el motor decide).
 * - con tokens → `2` (mixto): el motor pinta con sus gramáticas Y encima los
 *   tokens del host donde declaran. Es lo correcto porque el host puede tener
 *   cobertura parcial (el LSP de un lenguaje, la gramática de una extensión) y
 *   el motor no debería apagar lo que sí sabe.
 */

import { encodeHostTokens, mergeHostTokens, type HostToken, type SyntaxSource } from '@shared/syntax'
import { getPersistedHighlightSource } from '@services/storage'
import type { InnertaModule } from './InnertaEngine'

/** Fuentes que publican tokens del lado del host. */
export type HostTokenSource = Extract<SyntaxSource, 'textMate' | 'semanticTokens' | 'treeSitterDynamic'>

interface HostTokenState {
  path: string
  sources: Map<HostTokenSource, HostToken[]>
}

const states = new WeakMap<InnertaModule, HostTokenState>()

function stateOf(mod: InnertaModule, path: string): HostTokenState {
  const existing = states.get(mod)
  if (existing && existing.path === path) return existing
  const fresh: HostTokenState = { path, sources: new Map() }
  states.set(mod, fresh)
  return fresh
}

/**
 * Fuente de resaltado que se le pide al motor según lo que hay publicado y el
 * ajuste `editor.highlightSource` del usuario:
 *
 *  - `lsp`  → 1 (sólo host): pidió precisión máxima, el motor no pinta con sus
 *             gramáticas. Aplica igual a la gramática de una extensión: es
 *             resaltado del host, no del motor.
 *  - resto  → 2 (mixto) si hay algo publicado: el motor pinta lo que sabe y los
 *             tokens del host pisan donde declaran. Es el default porque el
 *             host puede tener cobertura parcial (LSP de un lenguaje, gramática
 *             de una extensión) y apagar lo que el motor sí sabe no tiene
 *             sentido.
 *  - nada   → 0: sólo tree-sitter embebido.
 */
function resolveHighlightSource(hasTokens: boolean): number {
  if (!hasTokens) return 0
  return getPersistedHighlightSource() === 'lsp' ? 1 : 2
}

/** Empuja al motor el estado actual (fusionado). */
function publish(mod: InnertaModule, state: HostTokenState): void {
  if (typeof mod.setHostTokens !== 'function') return
  const merged = mergeHostTokens(
    [...state.sources.entries()].map(([source, tokens]) => ({ source, tokens }))
  )
  mod.setHostTokens(encodeHostTokens(merged), resolveHighlightSource(merged.length > 0))
}

/**
 * Cambió el archivo: se tira TODO lo del anterior.
 *
 * Sin esto, los tokens del archivo A quedarían pintados sobre el archivo B
 * hasta que su fuente se recalcule (y el LSP tarda cientos de ms: se vería el
 * archivo nuevo con colores del viejo).
 */
export function resetHostTokens(mod: InnertaModule, path: string): void {
  const state = stateOf(mod, path)
  state.sources.clear()
  publish(mod, state)
}

/**
 * Publica (o limpia) los tokens de UNA fuente.
 *
 * `null` = esa fuente no tiene nada para decir (no hay gramática, el LSP no
 * respondió): se la saca del merge. No es lo mismo que `[]`, que tampoco
 * aportaría tokens pero perdería el "no volver a preguntar".
 */
export function setSourceTokens(
  mod: InnertaModule,
  path: string,
  source: HostTokenSource,
  tokens: HostToken[] | null
): void {
  const state = stateOf(mod, path)
  if (tokens === null || tokens.length === 0) {
    state.sources.delete(source)
  } else {
    state.sources.set(source, tokens)
  }
  publish(mod, state)
}

/** Para tests: cuántas fuentes están publicando en un módulo. */
export function sourceCount(mod: InnertaModule): number {
  return states.get(mod)?.sources.size ?? 0
}

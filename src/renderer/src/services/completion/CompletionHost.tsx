// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Popup de la lista de sugerencias (autocompletado).
 *
 * DOM puro (igual que el tooltip del hover y el menú contextual): el motor no
 * dibuja nada. Se posiciona en el caret con `state.rect`, que el controlador
 * calcula desde el motor. Montado UNA vez en AppShell.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import {
  getCompletionState,
  selectCompletion,
  subscribeToCompletion,
  type CompletionItem,
  type CompletionState
} from './state'
import { acceptCompletion, closeCompletionPopup } from './controller'
import styles from './CompletionHost.module.css'

/** LSP CompletionItemKind → glifo + clase de color. */
function kindBadge(kind: number): { glyph: string; tone: string } {
  switch (kind) {
    case 2:
    case 3:
    case 4:
      return { glyph: 'ƒ', tone: 'fn' }
    case 5:
    case 10:
      return { glyph: '·', tone: 'prop' }
    case 6:
    case 12:
      return { glyph: 'x', tone: 'var' }
    case 7:
    case 8:
    case 22:
      return { glyph: 'C', tone: 'type' }
    case 9:
      return { glyph: 'M', tone: 'mod' }
    case 13:
    case 20:
      return { glyph: 'E', tone: 'enum' }
    case 14:
      return { glyph: 'k', tone: 'kw' }
    case 15:
      return { glyph: '»', tone: 'snip' }
    case 17:
    case 19:
      return { glyph: '📄', tone: 'file' }
    case 21:
      return { glyph: 'c', tone: 'const' }
    case 25:
      return { glyph: 'T', tone: 'type' }
    default:
      return { glyph: '·', tone: 'text' }
  }
}

export function CompletionHost(): JSX.Element | null {
  const [state, setState] = useState<CompletionState>(() => getCompletionState())
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeToCompletion(setState), [])

  // Mantener visible el ítem seleccionado.
  useEffect(() => {
    if (!state.open) return
    const list = listRef.current
    const row = list?.children[state.selected] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [state.open, state.selected])

  if (!state.open || !state.rect) return null

  const width = 420
  const left = Math.min(Math.max(8, state.rect.x), window.innerWidth - width - 8)
  // Debajo del caret; si no entra, arriba.
  const below = state.rect.y + state.rect.height + 4
  const maxHeight = 240
  const top = below + maxHeight > window.innerHeight - 8 ? Math.max(8, state.rect.y - maxHeight - 4) : below

  const selected: CompletionItem | undefined = state.items[state.selected]

  return (
    <div
      className={styles.popup}
      style={{ left, top, width, maxHeight }}
      role="listbox"
      aria-label="Sugerencias"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className={styles.list} ref={listRef}>
        {state.items.map((item, index) => {
          const badge = kindBadge(item.kind)
          return (
            <button
              key={`${item.serverName}:${item.label}:${index}`}
              type="button"
              role="option"
              aria-selected={index === state.selected}
              className={[styles.row, index === state.selected ? styles.rowSelected : null]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => selectCompletion(index)}
              onClick={() => {
                selectCompletion(index)
                acceptCompletion(state.module)
              }}
            >
              <span className={[styles.badge, styles[badge.tone]].filter(Boolean).join(' ')}>
                {badge.glyph}
              </span>
              <span className={styles.label}>{item.label}</span>
              {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
            </button>
          )
        })}
      </div>

      {selected?.documentation ? (
        <div className={styles.docs}>{selected.documentation}</div>
      ) : null}

      <div className={styles.footer}>
        <span>{state.items.length} sugerencia(s)</span>
        <span className={styles.hint}>↑↓ elegir · Enter/Tab aceptar · Esc cerrar</span>
      </div>
    </div>
  )
}

/** Cierra el popup si otro subsistema lo necesita (p. ej. cambio de archivo). */
export function hideCompletion(): void {
  closeCompletionPopup()
}

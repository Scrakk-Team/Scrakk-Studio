/**
 * ModalHost — el ÚNICO pintor de modales del servicio global.
 *
 * Montado 1× en AppShell (junto a TooltipHost/NotificationHost). Apila los
 * modales activos: los options muestran lista filtrable; los custom delegan
 * en spec.render(ctx).
 */

import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { Modal } from '@ui'
import {
  subscribeToModals,
  snapshotModals,
  closeModal,
  resolveOptionModal,
  anchoredX
} from '@services/modals/registry'
import type { OptionsModalSpec, CustomModalSpec, AnchoredModalSpec } from '@services/modals/registry'
import styles from './ModalHost.module.css'

interface HostEntry {
  id: string
  spec: OptionsModalSpec | CustomModalSpec | AnchoredModalSpec
}

export function ModalHost(): JSX.Element {
  const [entries, setEntries] = useState<HostEntry[]>([])

  useEffect(() => {
    const sync = (): void => setEntries(snapshotModals())
    sync()
    return subscribeToModals(sync)
  }, [])

  return (
    <>
      {entries.map(({ id, spec }) =>
        spec.kind === 'options' ? (
          <OptionsList key={id} id={id} spec={spec} />
        ) : spec.kind === 'anchored' ? (
          <AnchoredPanel key={id} id={id} spec={spec} />
        ) : (
          <CustomBody key={id} id={id} spec={spec} />
        )
      )}
    </>
  )
}

function CustomBody({ id, spec }: { id: string; spec: CustomModalSpec }): JSX.Element {
  // Variante 'plain': sin overlay, se cierra con Esc (no hay backdrop).
  useEffect(() => {
    if (spec.variant !== 'plain') return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeModal(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, spec.variant])

  const rendered = typeof spec.render === 'function' ? (spec.render({ close: () => closeModal(id) }) as ReactNode) : null
  // Variante 'plain': sin overlay ni sombra; el contenido flota centrado y el
  // resto de la app sigue clickeable (chat spawneado de un subagente).
  if (spec.variant === 'plain') {
    return (
      <div className={styles.plainHost} role="dialog" aria-label={spec.title}>
        <div className={styles.plainPanel}>{rendered}</div>
      </div>
    )
  }
  return (
    <Modal open title={spec.title} size={spec.size ?? 'md'} onClose={() => closeModal(id)}>
      <div className={styles.body}>{rendered}</div>
    </Modal>
  )
}

/**
 * Panel anclado (popover): fijo junto al anchor, SIN overlay. Por defecto
 * abre hacia arriba (statusbar, alineado al borde derecho del botón);
 * con placement 'below' abre hacia abajo (titlebar). Esc o click afuera
 * lo cierran.
 */
function AnchoredPanel({ id, spec }: { id: string; spec: AnchoredModalSpec }): JSX.Element {
  const close = (): void => closeModal(id)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const panel = document.querySelector(`[data-anchored-id="${id}"]`)
      if (panel && !panel.contains(event.target as Node)) close()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const width = spec.width ?? 320
  const x = anchoredX(
    spec.anchor.x,
    spec.anchor.width,
    width,
    window.innerWidth,
    spec.align
  )
  // 'above' (statusbar): hacia arriba desde el borde superior del botón.
  // 'below' (titlebar): hacia abajo desde el borde inferior del botón.
  const positionStyle =
    spec.placement === 'below'
      ? { left: x, top: spec.anchor.y + spec.anchor.height + 8, width }
      : { left: x, bottom: window.innerHeight - spec.anchor.y + 8, width }
  const rendered =
    typeof spec.render === 'function' ? (spec.render({ close }) as ReactNode) : null
  return (
    <div
      data-anchored-id={id}
      role="dialog"
      aria-label={spec.title}
      className={styles.anchored}
      style={positionStyle}
    >
      <div className={styles.anchoredHeader}>
        <span className={styles.anchoredTitle}>{spec.title}</span>
      </div>
      <div className={styles.anchoredBody}>{rendered}</div>
    </div>
  )
}

function OptionsList({ id, spec }: { id: string; spec: OptionsModalSpec }): JSX.Element {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q
    ? spec.items.filter((i) => i.label.toLowerCase().includes(q))
    : spec.items

  return (
    <Modal open title={spec.title} size={spec.size ?? 'sm'} onClose={() => closeModal(id)}>
      <div className={styles.options}>
        {spec.items.length > 6 ? (
          <input
            className={styles.search}
            autoFocus
            placeholder="Filtrar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        ) : null}
        {filtered.length === 0 ? (
          <p className={styles.empty}>{spec.emptyMessage ?? 'Sin opciones'}</p>
        ) : (
          <ul className={styles.list} role="listbox">
            {filtered.map((item) => (
              <li key={item.id}>
                {item.separatorBefore ? <div className={styles.separator} /> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  className={[styles.item, item.danger ? styles.danger : null, item.disabled ? styles.disabled : null]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={item.disabled}
                  onClick={() => resolveOptionModal(id, item.id)}
                >
                  <span className={styles.label}>{item.label}</span>
                  {item.description ? <span className={styles.desc}>{item.description}</span> : null}
                  {item.hint ? <kbd className={styles.hint}>{item.hint}</kbd> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

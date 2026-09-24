// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import { ProductIcon } from '@services/productIcons/components'
import {
  PanelTitleProvider,
  orderHeaderActions,
  subscribeToHeaderActions,
  usePanelTitle
} from '../../state'
import type { TabDragPayload } from '@features/dnd'
import styles from './PanelFrame.module.css'

/**
 * Aplana los hijos de las acciones a una lista de botones.
 *
 * Los paneles declaran sus acciones adentro de un fragmento (`<>…</>`), y
 * `Children.toArray` NO aplana fragmentos (los trata como un solo hijo): sin
 * esto el header vería UN nodo —el fragmento— y el reorden sería un no-op.
 * Los fragmentos no pintan nada, así que aplanarlos no cambia el DOM.
 *
 * La lista un `<div>`/`<span>` que agrupe botones NO se aplana: ese wrapper no
 * tiene id y sus hijos no son reordenables (para que lo sean, los botones van
 * directos o dentro de fragmentos).
 */
function flattenActions(nodes: ReactNode): ReactNode[] {
  const out: ReactNode[] = []
  for (const child of Children.toArray(nodes)) {
    if (isValidElement(child) && child.type === Fragment) {
      out.push(...flattenActions((child.props as { children?: ReactNode }).children))
      continue
    }
    out.push(child)
  }
  return out
}

/**
 * Traduce un botón a lo que el store entiende (id + orden).
 *
 * El id sale de la prop `id` del botón (`HeaderActionButton`, la API para
 * agregar botones al header). Un nodo sin id — un botón viejo sin migrar, un
 * `<span>` — conserva su posición declarada y nunca recibe overrides.
 */
function readAction(node: ReactNode, index: number): { id: string; order: number; node: ReactNode } {
  const props = isValidElement(node)
    ? (node.props as { id?: unknown; order?: unknown })
    : null
  return {
    id: typeof props?.id === 'string' && props.id.length > 0 ? props.id : `__declared:${index}`,
    order: typeof props?.order === 'number' ? props.order : index * 10,
    node
  }
}

interface PanelFrameProps {
  title: string
  children: ReactNode
  /**
   * Payload de drag de la tab ÚNICA del slot: el header se convierte en
   * manija para mover el panel (payload de tab) a cualquier otra zona.
   */
  dragPayload?: TabDragPayload | null
  /**
   * Acción de cierre (X al final del header). Los paneles del sistema de
   * slots no lo usan (cierran via tabs), pero hosts embebidos (ToolDock) sí.
   */
  onClose?: (() => void) | null
}

/**
 * Marco genérico de un panel: header con título + acciones del panel y área
 * de contenido. Cuando el slot tiene UNA sola tab, el header es la manija
 * de drag (se arrastra la tab del slot).
 *
 * Provee el PanelTitleContext para que el panel cambie su título/acciones.
 */
export function PanelFrame({
  title,
  children,
  dragPayload = null,
  onClose = null
}: PanelFrameProps): JSX.Element {
  return (
    <PanelTitleProvider initialTitle={title}>
      <PanelFrameInner dragPayload={dragPayload} onClose={onClose}>
        {children}
      </PanelFrameInner>
    </PanelTitleProvider>
  )
}

function PanelFrameInner({
  children,
  dragPayload,
  onClose
}: {
  children: ReactNode
  dragPayload: TabDragPayload | null
  onClose: (() => void) | null
}): JSX.Element {
  const { title, actions } = usePanelTitle()
  const [orderVersion, setOrderVersion] = useState(0)

  // Los botones del header se reordenan drageando (ver HeaderActionButton) y
  // el orden vive en el store: hay que repintar cuando cambia. `orderVersion`
  // es deliberadamente el único state que provoca ese re-render.
  useEffect(() => subscribeToHeaderActions(() => setOrderVersion((v) => v + 1)), [])

  const orderedActions = useMemo<ReactNode[]>(() => {
    if (!actions) return []
    return orderHeaderActions(flattenActions(actions()).map(readAction)).map(
      (entry) => entry.node
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, orderVersion])

  // Drag DECLARATIVO: el detector global de [data-drag-header] convierte el
  // header en manija con solo estos atributos (sin hooks ni imports).
  const dragAttrs = dragPayload
    ? {
        'data-drag-header': '',
        'data-drag-strip': dragPayload.stripId,
        'data-drag-tab': dragPayload.tabId,
        'data-drag-label': dragPayload.label ?? title
      }
    : null

  return (
    <div className={styles.frame}>
      <header
        className={styles.header}
        title={dragPayload ? `Arrastrar ${dragPayload.label ?? title ?? ''}` : undefined}
        style={dragPayload ? { cursor: 'grab' } : undefined}
        {...dragAttrs}
      >
        <span className={styles.title} title={title ?? undefined}>
          {title}
        </span>
        {/* `data-header-actions` define el alcance del reorden de los
            botones: HeaderActionButton sólo reordena dentro de este div. */}
        {orderedActions.length > 0 ? (
          <div className={styles.actions} data-header-actions="">
            {orderedActions}
          </div>
        ) : null}
        {onClose ? (
          <div className={styles.actions}>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
              <ProductIcon id="close" size={14} />
            </button>
          </div>
        ) : null}
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  )
}

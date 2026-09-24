// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, useState, type JSX } from 'react'
import { splitTreeStore, type SplitTreeNode } from '../../splitTree'
import type { SlotId } from '../../types'
import type { StripAction } from '@features/tabs'
import { SlotBody } from '../PanelLayout/SlotBody'
import { ResizeHandle } from '../ResizeHandle/ResizeHandle'
import { flushLayoutPersist } from '../../state/LayoutContext'
import styles from './SplitView.module.css'

const RATIO_MIN = 0.15
const RATIO_MAX = 0.85
const RATIO_STEP = 0.05

/** ¿El slot está visible (tiene raíz en el árbol de splits)? */
export function isSlotOpen(slot: SlotId): boolean {
  return splitTreeStore.isSlotOpen(slot)
}

/**
 * Renderiza la raíz del árbol de splits de un slot: un leaf es un SlotBody
 * (strip de tabs); un split es una fila/columna recursiva con su
 * ResizeHandle de ratio. La separación entre lados es la MISMA que entre
 * slots (mismo ResizeHandle), pero con la cápsula CUADRADA — sin el
 * redondeo de las tarjetas exteriores.
 */
export function SplitView({ slot, onAddTab, actions }: { slot: SlotId; onAddTab?: () => void; actions?: StripAction[] }): JSX.Element | null {
  const [version, setVersion] = useState(0)
  useEffect(() => splitTreeStore.subscribe(() => setVersion((v) => v + 1)), [])
  void version

  const root = splitTreeStore.getRoot(slot)
  if (!root) return null
  return <SplitNode node={root} slot={slot} nested={false} onAddTab={onAddTab} actions={actions} />
}

function SplitNode({
  node,
  slot,
  nested,
  onAddTab,
  actions
}: {
  node: SplitTreeNode
  slot: SlotId
  nested: boolean
  onAddTab?: () => void
  actions?: StripAction[]
}): JSX.Element {
  // Refs SIEMPRE arriba (el nodo puede mutar leaf<->split entre renders).
  // Nodos laterales para escritura DOM directa durante el drag en vivo
  // (misma flex que el render: `${ratio} 1 0%` / `${1-ratio} 1 0%`).
  const firstRef = useRef<HTMLDivElement | null>(null)
  const secondRef = useRef<HTMLDivElement | null>(null)
  if (node.type === 'leaf') {
    // `nested` = la hoja vive DENTRO de un split: tarjeta con borde propio
    // (los bordes de ambos lados flanquean el handle). La raíz leaf (slot
    // SIN partir) queda lisa: la tarjeta exterior ya da el borde.
    return (
      <div className={nested ? styles.leaf : styles.leafRoot}>
        {/* Una hoja DENTRO de un split SIEMPRE muestra el strip de tabs,
            como los grupos de VS Code: el lado partido muestra la tab
            (p.ej. Chat <-> Terminal), NO un PanelFrame con título — el
            split no debe crear otro título adentro. El centro también
            siempre es strip (el welcome es una tab). El slot inferior
            también (sus tabs SON terminales y llevan su propio "+").
            Solo la raíz leaf de los slots laterales usa el frame único
            clásico con 1 tab. */}
        <SlotBody stripId={node.stripId} alwaysStrip={nested || slot === 'center' || slot === 'bottom'} onAddTab={slot === 'bottom' ? onAddTab : undefined} actions={slot === 'bottom' ? actions : undefined} />
      </div>
    )
  }
  const column = node.dir === 'column'
  const writeLive = (ratio: number): void => {
    const first = firstRef.current
    const second = secondRef.current
    if (first) first.style.flex = `${ratio} 1 0%`
    if (second) second.style.flex = `${1 - ratio} 1 0%`
  }
  return (
    <div className={styles.split} data-dir={node.dir}>
      <div ref={firstRef} className={styles.side} style={{ flex: `${node.ratio} 1 0%` }}>
        <SplitNode node={node.children[0]} slot={slot} nested onAddTab={onAddTab} actions={actions} />
      </div>
      <ResizeHandle
        label="Redimensionar split"
        value={node.ratio}
        min={RATIO_MIN}
        max={RATIO_MAX}
        step={RATIO_STEP}
        direction={column ? 'horizontal' : 'vertical'}
        square
        onResize={(ratio) => splitTreeStore.setRatio(node.id, ratio)}
        onLive={writeLive}
        onCommit={(ratio) => {
          // Commit ÚNICO al soltar el drag: un emit + un write inmediato
          // (el trailing del debounce se cancela dentro del flush).
          splitTreeStore.setRatio(node.id, ratio)
          flushLayoutPersist()
        }}
      />
      <div ref={secondRef} className={styles.side} style={{ flex: `${1 - node.ratio} 1 0%` }}>
        <SplitNode node={node.children[1]} slot={slot} nested onAddTab={onAddTab} actions={actions} />
      </div>
    </div>
  )
}
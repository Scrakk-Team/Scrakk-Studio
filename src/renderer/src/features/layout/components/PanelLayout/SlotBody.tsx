// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { tabsStore, TabStrip, type StripAction, type StripId, type TabSpec } from '@features/tabs'
import { useDropZone, useResourceDrop } from '@features/dnd'
import { getPanel } from '../../registry'
import { activateTabSmart, closeTabSmart, openResourceTabs, tabIconFor } from '../../actions'
import { splitTreeStore } from '../../splitTree'
import { PanelFrame } from '../PanelFrame/PanelFrame'
import { ResizeHandle } from '../ResizeHandle/ResizeHandle'
import { TabContentView } from '../TabContentView/TabContentView'
import styles from '../PanelLayout/PanelLayout.module.css'

/** Título por defecto de una tab (para el PanelFrame / header). */
function titleFor(tab: TabSpec): string {
  if (tab.label) return tab.label
  if (tab.kind === 'panel' && tab.panelId) return getPanel(tab.panelId)?.title ?? tab.panelId
  if (tab.kind === 'file') return tab.filePath?.split(/[/\\\\]/).pop() ?? 'Archivo'
  return tab.id
}

interface SlotBodyProps {
  stripId: StripId
  /**
   * Si true, SIEMPRE muestra strip de tabs (aunque haya UNA sola tab).
   * Lo usa el centro (el welcome es una tab, no un header único) y TODAS
   * las hojas DENTRO de un split legacy. Sin esto, una strip con 1 tab usa
   * frame único (PanelFrame).
   */
  alwaysStrip?: boolean
  /** Acción custom del "+" del strip (se propaga al TabStrip). */
  onAddTab?: () => void
  /** Acciones custom del contenedor derecho del strip (máx 4). */
  actions?: StripAction[]
}

/**
 * Cuerpo de un strip:
 * - UNA tab (y no centro) → PanelFrame (look clásico, header con título).
 * - VARIAS tabs sin split → TabStrip + contenido de la activa (stack).
 * - Con `strip.splitDir` (split de contenido) → TabStrip COMPARTIDA arriba
 *   (la dueña con su cadena ⇄) y el contenido DIVIDIDO: un panel por tab,
 *   separados por el ResizeHandle cuadrado. Nada de barras por lado.
 *
 * Zonas de drop:
 * - CUERPO (header / barra de tabs): inserta como tab (reorden / stack).
 * - CONTENIDO: los bordes habilitan el SPLIT del contenido: la tab drageada
 *   entra a la MISMA strip (barra compartida) y el contenido pasa a mostrarse
 *   dividido en paneles (una vista por tab).
 */
export function SlotBody({ stripId, alwaysStrip = false, onAddTab, actions }: SlotBodyProps): JSX.Element | null {
  const strip = tabsStore.getStrip(stripId)
  // Strip OCULTO (removeStrip): no se renderiza.
  if (!strip) return null

  // En modo frame (1 sola tab) el drop SIEMPRE inserta al final: soltar la
  // terminal sobre el panel de chat deja [chat, terminal] sin importar la X.
  const single = !alwaysStrip && strip.tabs.length === 1
  const splitActive = !!strip.splitDir && strip.tabs.length >= 2
  const bodyZone = useDropZone({ kind: 'strip', stripId, append: single || splitActive })
  const contentZone = useDropZone({
    kind: 'strip',
    stripId,
    append: single || splitActive,
    isSplit: true
  })
  // Drop NATIVO de un recurso del explorador (archivo/carpeta) → tab.
  const resourceDrop = useResourceDrop(
    useCallback((items) => openResourceTabs(stripId, items), [stripId])
  )
  const active =
    (strip.activeId ? strip.tabs.find((t) => t.id === strip.activeId) : null) ??
    strip.tabs[0]

  // Slot abierto pero VACÍO: placeholder con mensaje + cerrar. Todo el área
  // es contenido (no hay header): la zona con split cubre el placeholder.
  if (!active) {
    return (
      <div
        ref={contentZone.ref}
        className={styles.slotBody}
        onDragOver={resourceDrop.onDragOver}
        onDragLeave={resourceDrop.onDragLeave}
        onDrop={resourceDrop.onDrop}
      >
        <div className={styles.emptySlot}>
          <p className={styles.emptySlotTitle}>Slot vacío</p>
          <p className={styles.emptySlotHint}>Arrastrá una tab o un panel aquí</p>
          <button
            type="button"
            className={styles.emptySlotClose}
            title="Cerrar este slot"
            onClick={() => splitTreeStore.removeStrip(stripId)}
          >
            <ProductIcon id="close" size={12} aria-hidden="true" />
            Cerrar slot
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={bodyZone.ref}
      className={styles.slotBody}
      onDragOver={resourceDrop.onDragOver}
      onDragLeave={resourceDrop.onDragLeave}
      onDrop={resourceDrop.onDrop}
    >
      {single ? (
        <PanelFrame
          title={titleFor(active)}
          dragPayload={
            active.fixed
              ? null
              : { type: 'tab', stripId, tabId: active.id, label: titleFor(active) }
          }
        >
          <div ref={contentZone.ref} className={styles.tabbedContent}>
            <TabContentView tab={active} stripId={stripId} />
          </div>
        </PanelFrame>
      ) : (
        <>
          <TabStrip
            stripId={stripId}
            iconFor={tabIconFor}
            onActivate={(tab, strip) => activateTabSmart(strip, tab)}
            onClose={(tab, strip) => closeTabSmart(strip, tab)}
            onAddTab={onAddTab}
            actions={actions}
          />
          {splitActive && strip.splitDir ? (
            <SplitPanes stripId={stripId} tabs={strip.tabs} dir={strip.splitDir} zoneRef={contentZone.ref} />
          ) : (
            <div ref={contentZone.ref} className={styles.tabbedContent}>
              <TabContentView tab={active} stripId={stripId} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface SplitPanesProps {
  stripId: StripId
  tabs: TabSpec[]
  dir: 'row' | 'column'
  zoneRef: (el: HTMLElement | null) => void
}

/**
 * Contenido DIVIDIDO de un strip: un panel por tab (montados todos en
 * paralelo) con un ResizeHandle CUADRADO entre ellos — la misma separación
 * que entre los paneles del layout, solo que sin redondeo. La barra de tabs
 * compartida queda ARRIBA (la renderiza SlotBody); aquí no hay títulos.
 */
function SplitPanes({ stripId, tabs, dir, zoneRef }: SplitPanesProps): JSX.Element {
  // Pesos por panel (flex). Se re-inician solo si cambia la CANTIDAD de tabs.
  const [weights, setWeights] = useState<number[]>(() => tabs.map(() => 1))
  useEffect(() => {
    setWeights((current) => (current.length === tabs.length ? current : tabs.map(() => 1)))
  }, [tabs.length])

  // Nodos de panes para escritura DOM directa durante el drag en vivo.
  const paneEls = useRef(new Map<string, HTMLElement | null>())
  // Purgar refs de tabs cerradas (si no, retienen DOM desmontado).
  useEffect(() => {
    const alive = new Set(tabs.map((t) => t.id))
    for (const key of paneEls.current.keys()) {
      if (!alive.has(key)) paneEls.current.delete(key)
    }
  }, [tabs])

  const isRow = dir === 'row'
  // Pesos por fracción (commit): la misma función sirve para live (por
  // evento) y ghost (una vez al soltar) — los pesos son estado local.
  const handleResize =
    (gap: number) =>
    (fraction: number): void => {
      setWeights((current) => {
        const a = current[gap]
        const b = current[gap + 1]
        if (a === undefined || b === undefined) return current
        const total = a + b
        const next = [...current]
        next[gap] = Math.max(0.1, Math.min(0.9, fraction)) * total
        next[gap + 1] = total - next[gap]
        return next
      })
    }
  const gapFraction = (gap: number): number => {
    const a = weights[gap] ?? 1
    const b = weights[gap + 1] ?? 1
    return a / (a + b)
  }

  const panes: JSX.Element[] = []
  tabs.forEach((tab, index) => {
    const tabId = tab.id
    panes.push(
      <div
        key={tab.id}
        ref={(el) => {
          paneEls.current.set(tabId, el)
        }}
        className={styles.pane}
        style={{ flex: `${weights[index] ?? 1} 1 0%` }}
      >
        <TabContentView tab={tab} stripId={stripId} />
      </div>
    )
    if (index < tabs.length - 1) {
      const gap = index
      const nextTab = tabs[gap + 1]
      panes.push(
        <ResizeHandle
          key={`gap-${tab.id}`}
          label="Redimensionar vista"
          value={gapFraction(gap)}
          min={0.15}
          max={0.85}
          step={0.05}
          direction={isRow ? 'vertical' : 'horizontal'}
          square
          onResize={handleResize(gap)}
          onLive={
            nextTab
              ? (fraction) => {
                  // Réplica DOM-directa de handleResize (misma fórmula).
                  const a = weights[gap] ?? 1
                  const b = weights[gap + 1] ?? 1
                  const total = a + b
                  const wa = Math.max(0.1, Math.min(0.9, fraction)) * total
                  const elA = paneEls.current.get(tabId)
                  const elB = paneEls.current.get(nextTab.id)
                  if (elA) elA.style.flex = `${wa} 1 0%`
                  if (elB) elB.style.flex = `${total - wa} 1 0%`
                }
              : undefined
          }
          onCommit={handleResize(gap)}
        />
      )
    }
  })

  return (
    <div ref={zoneRef} className={styles.splitPanes} data-dir={dir}>
      {panes}
    </div>
  )
}

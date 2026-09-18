/**
 * ToolDock — píldora horizontal de botones que cualquier panel monta con
 * <ToolDock hostId="…" />. "Sobresale" como la ActivityBar pero horizontal:
 * el panel flotante crece hacia ARRIBA calculando bounds (max-height 60vh).
 *
 * Botones que puede mostrar (todos via API, cero hardcodeo):
 *  - Items registrados con registerToolDockItem cuyo `hosts` matchee.
 *  - Botones de la ActivityBar con override side='toolDock' (drag & drop,
 *    mismo sistema de drag de la ActivityBar).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from 'react'
import { createPortal } from 'react-dom'
import { ProductIcon } from '@services/productIcons/components'
import { PanelFrame } from '@features/layout'
import {
  getToolDockedButtons,
  moveButton,
  subscribeToButtonLayout,
  type ButtonSide
} from '@features/activitybar'
import { toggleSlotPanel } from '@features/layout'
import {
  getToolDockItemsForHost,
  subscribeToToolDockItems
} from '../registry'
import { useToolDockHost } from '../state/ToolDockHostContext'
import type { DockEntry, ToolDockItem } from '../types'
import styles from './ToolDock.module.css'

export function ToolDock(): JSX.Element | null {
  const { hostId, hostInfo, activePanelId, togglePanel, panelHeight, setPanelHeight, closing } =
    useToolDockHost()
  const [itemsVersion, setItemsVersion] = useState(0)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [dragId, setDragId] = useState<string | null>(null)

  // Items del registry y botones dockeados: versiones para re-render.
  useEffect(() => subscribeToToolDockItems(() => setItemsVersion((v) => v + 1)), [])
  useEffect(() => subscribeToButtonLayout(() => setLayoutVersion((v) => v + 1)), [])
  void itemsVersion
  void layoutVersion

  const entries = useMemo<DockEntry[]>(() => {
    const docked: DockEntry[] = getToolDockedButtons().map((button) => ({
      kind: 'activity',
      button
    }))
    const itemEntries: DockEntry[] = getToolDockItemsForHost(hostInfo).map((item) => ({
      kind: 'item',
      item
    }))
    // Dockeados primero (orden de la barra), luego items del registry.
    return [...docked, ...itemEntries]
  }, [hostInfo, itemsVersion, layoutVersion])

  if (entries.length === 0) return null

  const activeItem = entries.find(
    (entry) => entry.kind === 'item' && entry.item.id === activePanelId
  )
  const activePanelItem = activeItem?.kind === 'item' ? activeItem.item : null

  // ── Drag de botones dockeados (mismo sistema que la ActivityBar) ────────
  const handleButtonPointerDown = (event: React.PointerEvent, entry: DockEntry): void => {
    if (event.button !== 0 || entry.kind !== 'activity') return
    const id = entry.button.id
    let started = false
    const startX = event.clientX
    const startY = event.clientY

    const onMove = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      if (!started && Math.abs(dx) + Math.abs(dy) < 6) return
      if (!started) {
        started = true
        setDragId(id)
        document.body.style.cursor = 'grabbing'
      }
      const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
      // Volver a una barra lateral (índice por mitades verticales).
      const bar = under?.closest?.('nav[data-side]') as HTMLElement | null
      if (bar) {
        const side = (bar.dataset.side === 'right' ? 'right' : 'left') as ButtonSide
        moveButton(id, side, activityBarIndexAt(bar, moveEvent.clientY, id))
        return
      }
      // Reorden dentro del dock (índice por mitades horizontales).
      const dock = under?.closest?.('[data-tool-dock]') as HTMLElement | null
      if (dock) {
        moveButton(id, 'toolDock', dockIndexAt(dock, moveEvent.clientX, id))
      }
    }

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      setDragId(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const [liveHeight, setLiveHeight] = useState<number | null>(null)
  const resizeRef = useRef<{
    startY: number
    startHeight: number
    pendingHeight: number
    moved: boolean
  } | null>(null)
  const resizeRaf = useRef<number | null>(null)

  const handleResizeStart = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      try {
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      } catch {
        // ignore
      }
      const startY = event.clientY
      const startHeight = liveHeight ?? panelHeight
      resizeRef.current = {
        startY,
        startHeight,
        pendingHeight: startHeight,
        moved: false
      }
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'

      const onMove = (moveEvent: PointerEvent): void => {
        const state = resizeRef.current
        if (!state) return
        state.pendingHeight = Math.max(120, state.startHeight + (state.startY - moveEvent.clientY))
        state.moved = true
        if (resizeRaf.current !== null) return
        resizeRaf.current = requestAnimationFrame(() => {
          resizeRaf.current = null
          const s = resizeRef.current
          if (!s) return
          setLiveHeight(s.pendingHeight)
        })
      }
      const onUp = (upEvent: PointerEvent): void => {
        if (resizeRaf.current !== null) {
          cancelAnimationFrame(resizeRaf.current)
          resizeRaf.current = null
        }
        const state = resizeRef.current
        resizeRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        try {
          ;(upEvent.currentTarget as HTMLElement)?.releasePointerCapture?.(upEvent.pointerId)
        } catch {
          // ignore
        }
        setLiveHeight(null)
        if (state?.moved) setPanelHeight(state.pendingHeight)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [panelHeight, setPanelHeight, liveHeight]
  )

  // Ancla real de la píldora: el panel flotante se renderiza en un PORTAL
  // (position: fixed, document.body) para que ningún `overflow: hidden` del
  // host lo corte, y no hereda el ancho del panel.
  const pillRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number; width: number } | null>(null)

  const measureAnchor = useCallback((): void => {
    const pill = pillRef.current
    const rect = pill?.getBoundingClientRect()
    if (!pill || !rect || rect.width === 0) {
      setAnchor(null)
      return
    }
    // Ancho del panel donde está montado el dock (cualquiera que lo use),
    // para que el menú lo respete pero deje 8px de aire a cada lado.
    const tooldockEl = pill.closest('.tooldock') as HTMLElement | null
    const hostEl = (tooldockEl?.parentElement as HTMLElement | null) ?? pill.parentElement
    const hostWidth = hostEl?.clientWidth ?? rect.width * 6
    const panelWidth = Math.max(240, Math.min(360, hostWidth - 16))
    setAnchor({
      left: rect.left + rect.width / 2,
      // 10px de aire entre la píldora y el menú flotante.
      bottom: window.innerHeight - rect.top + 10,
      width: panelWidth
    })
  }, [])

  useLayoutEffect(() => {
    if (!activePanelItem) {
      setAnchor(null)
      return
    }
    measureAnchor()
    window.addEventListener('resize', measureAnchor)
    // Seguir el ancho del panel donde está el dock en tiempo real.
    const pill = pillRef.current
    const tooldockEl = pill?.closest('.tooldock') as HTMLElement | null
    const hostEl = (tooldockEl?.parentElement as HTMLElement | null) ?? pill?.parentElement
    const ro = hostEl ? new ResizeObserver(measureAnchor) : null
    if (hostEl && ro) ro.observe(hostEl)
    return () => {
      window.removeEventListener('resize', measureAnchor)
      if (ro && hostEl) ro.unobserve(hostEl)
      ro?.disconnect()
    }
  }, [activePanelItem, measureAnchor])

  useEffect(
    () => () => {
      if (resizeRaf.current !== null) cancelAnimationFrame(resizeRaf.current)
      resizeRaf.current = null
      resizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
    []
  )

  const maxHeight = Math.max(120, anchor ? anchor.bottom - 24 : 600)
  const displayHeight = Math.min(liveHeight ?? panelHeight, maxHeight)

  return (
    <div className={styles.tooldock}>
      {activePanelItem && anchor
        ? createPortal(
            <div
              className={[styles.panel, closing ? styles.closing : null].filter(Boolean).join(' ')}
              style={{
                left: anchor.left,
                bottom: anchor.bottom,
                width: anchor.width,
                height: displayHeight
              }}
            >
              <div className={styles.resizeHandle} onPointerDown={handleResizeStart} />
              {/* key = id del panel: al cambiar de panel activo el nodo del portal
                  se REUSA, y PanelTitleProvider guarda el título en
                  useState(initialTitle) → sin key el header se quedaba con el
                  título del PRIMER panel abierto (ej. "Línea de tiempo"). La key
                  lo remonta con su título y acciones propios. */}
              <PanelFrame
                key={activePanelItem.id}
                title={activePanelItem.title}
                onClose={() => togglePanel(activePanelItem.id)}
              >
                <div className={styles.panelBody}>
                  <LazyPanel
                    item={activePanelItem}
                    hostId={hostId}
                    currentFile={hostInfo.currentFile}
                  />
                </div>
              </PanelFrame>
            </div>,
            document.body
          )
        : null}

      <div ref={pillRef} data-tool-dock="" className={styles.buttons}>
        {entries.map((entry) => {
          const id = entry.kind === 'activity' ? entry.button.id : entry.item.id
          const isActive =
            entry.kind === 'item' && entry.item.id === activePanelId
          return (
            <button
              key={id}
              type="button"
              data-button-id={id}
              title={entry.kind === 'activity' ? entry.button.label : entry.item.title}
              aria-label={entry.kind === 'activity' ? entry.button.label : entry.item.title}
              className={[styles.button, isActive ? styles.active : null, dragId === id ? styles.dragging : null]
                .filter(Boolean)
                .join(' ')}
              onPointerDown={(event) => handleButtonPointerDown(event, entry)}
              onClick={() => {
                if (entry.kind === 'activity') {
                  // Igual que la ActivityBar: activa el panel que declara.
                  toggleSlotPanel(entry.button.target, entry.button.panelId)
                } else {
                  togglePanel(entry.item.id)
                }
              }}
            >
              <ButtonIcon entry={entry} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function activityBarIndexAt(bar: HTMLElement, y: number, skipId: string): number {
  const btns = Array.from(bar.querySelectorAll<HTMLElement>('[data-button-id]'))
  let index = 0
  for (const el of btns) {
    const id = el.dataset.buttonId
    if (!id || id === skipId) continue
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) continue
    if (y > rect.top + rect.height / 2) index++
    else break
  }
  return index
}

function dockIndexAt(dock: HTMLElement, x: number, skipId: string): number {
  const btns = Array.from(dock.querySelectorAll<HTMLElement>('[data-button-id]'))
  let index = 0
  for (const el of btns) {
    const id = el.dataset.buttonId
    if (!id || id === skipId) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) continue
    if (x > rect.left + rect.width / 2) index++
    else break
  }
  return index
}

function ButtonIcon({ entry }: { entry: DockEntry }): JSX.Element {
  if (entry.kind === 'item') {
    return <ProductIcon id={entry.item.icon} size={16} />
  }
  const icon = entry.button.icon
  return typeof icon === 'string' ? (
    <span className={styles.buttonSvg} dangerouslySetInnerHTML={{ __html: icon }} />
  ) : (
    (() => {
      const Icon = icon
      return <Icon size={16} />
    })()
  )
}

/** Monta el componente lazy del panel activo. */
function LazyPanel({
  item,
  hostId,
  currentFile
}: {
  item: ToolDockItem
  hostId: string
  currentFile: { path: string; name: string } | null
}): JSX.Element | null {
  if (!item.component) return null
  const Component = item.component
  return <Component hostId={hostId} currentFile={currentFile} />
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, useState, type JSX } from 'react'
import { tabsStore, type StripId } from '@features/tabs'
import { splitTreeStore } from '../../splitTree'
import type { SlotId } from '../../types'
import { SplitView, isSlotOpen } from '../SplitView/SplitView'
import { ResizeHandle, CornerResizeHandle } from '../ResizeHandle/ResizeHandle'
import {
  loadSlotSizes,
  setSlotSizesCache,
  persistLayoutSnapshot
} from '../../persistence'
import { openNewTerminalTab } from '../../actions'
import { ProductIcon } from '@services/productIcons/components'
import { TerminalNodesView } from '../TerminalNodes/TerminalNodesView'
import styles from './PanelLayout.module.css'

const LEFT_DEFAULT = 260
const LEFT_MIN = 200
const LEFT_MAX = 440

const RIGHT_DEFAULT = 300
const RIGHT_MIN = 220
const RIGHT_MAX = 520

const BOTTOM_DEFAULT = 220
const BOTTOM_MIN = 120
const BOTTOM_MAX = 480

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface SlotSectionProps {
  slot: StripId
  className: string
  style?: React.CSSProperties
  /** Ref al <section> para escrituras DOM directas durante el drag. */
  sectionRef?: (el: HTMLElement | null) => void
}

/**
 * Clase de la tarjeta exterior de un slot: cuando el slot está PARTIDO (su
 * raíz es un split real o, legacy, su strip tiene contenido dividido), la
 * tarjeta no dibuja su propio borde — la separación la marcan los bordes de
 * las hojas. Si no, el borde normal de la tarjeta es el correcto.
 */
function cardClass(className: string, slot: SlotId): string {
  const root = splitTreeStore.getRoot(slot)
  if (root && root.type === 'split') {
    return `${className} ${styles.cardNoBorder}`
  }
  const strip = tabsStore.getStrip(slot)
  if (strip && strip.splitDir && strip.tabs.length >= 2) {
    return `${className} ${styles.cardNoBorder}`
  }
  return className
}

/**
 * Sección de un slot: mantiene la tarjeta visual (borde, radio, fondo) y
 * renderiza adentro la raíz del árbol de splits de ese slot.
 */
function SlotSection({ slot, className, style, sectionRef }: SlotSectionProps): JSX.Element {
  return (
    <section ref={sectionRef} className={className} style={style}>
      <SplitView slot={slot as 'left' | 'center' | 'right' | 'bottom'} />
    </section>
  )
}

/**
 * Distribución de los cuatro slots (izquierda / centro / derecha / inferior).
 * Cada slot contiene un ÁRBOL DE SPLITS (SplitView): su raíz puede ser un
 * leaf (strip multi-tab o frame clásico) o un split recursivo (estilo VS
 * Code, horizontal y vertical). Los slots se redimensionan con handles, como
 * antes; los splits internos tienen su propio handle de ratio.
 */
export function PanelLayout(): JSX.Element {
  // Anchos restaurados del snapshot (antes se perdían al recargar).
  const [leftWidth, setLeftWidth] = useState(() => loadSlotSizes().left ?? LEFT_DEFAULT)
  const [rightWidth, setRightWidth] = useState(() => loadSlotSizes().right ?? RIGHT_DEFAULT)
  const [bottomHeight, setBottomHeight] = useState(() => loadSlotSizes().bottom ?? BOTTOM_DEFAULT)

  /**
   * Commit de anchos tras soltar el drag: actualiza estado + caché y
   * persiste INMEDIATO (un solo write por drag; estos commits no pasan por
   * stores así que el debounce del provider nunca los vería).
   */
  const commitWidths = (next: { left?: number; right?: number; bottom?: number }): void => {
    if (next.left !== undefined) setLeftWidth(next.left)
    if (next.right !== undefined) setRightWidth(next.right)
    if (next.bottom !== undefined) setBottomHeight(next.bottom)
    setSlotSizesCache({
      left: next.left ?? leftWidth,
      right: next.right ?? rightWidth,
      bottom: next.bottom ?? bottomHeight
    })
    persistLayoutSnapshot()
  }

  // Vista de nodos (lienzo infinito) del slot inferior: las sesiones vivas se
  // re-parentan a los nodos, así que tabs y lienzo son excluyentes.
  const [showTerminalNodes, setShowTerminalNodes] = useState(false)

  // Nodos <section> para escritura DOM directa durante el drag en vivo.
  // Los closures capturan el render actual — válido porque no hay re-renders
  // en pleno drag (cero setState hasta el commit).
  const sectionEls = useRef(new Map<StripId, HTMLElement | null>())
  const setSectionEl =
    (slot: StripId) =>
    (el: HTMLElement | null): void => {
      sectionEls.current.set(slot, el)
    }

  /** Réplica DOM-directa de leftStyle/rightStyle (misma rama sharing). */
  const writeSideLive = (slot: 'left' | 'right', width: number, sharing: boolean): void => {
    const el = sectionEls.current.get(slot)
    if (!el) return
    if (sharing) {
      el.style.flexBasis = `${width}px`
    } else {
      el.style.width = `${width}px`
    }
  }

  const writeBottomLive = (height: number): void => {
    const el = sectionEls.current.get('bottom')
    if (!el) return
    el.style.height = `${height}px`
  }

  // Re-render ante CUALQUIER mutación del store de tabs (spawn/close/move/
  // remove) o del árbol de splits (split/prune/ratio): este componente
  // decide qué slots se renderizan, así que no puede depender del tick del
  // LayoutProvider (sus children no re-renderizan si el elemento no cambió).
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const unsubTabs = tabsStore.subscribe(() => setVersion((v) => v + 1))
    const unsubTree = splitTreeStore.subscribe(() => setVersion((v) => v + 1))
    return () => {
      unsubTabs()
      unsubTree()
    }
  }, [])
  void version

  const hasLeft = isSlotOpen('left')
  const hasRight = isSlotOpen('right')
  const hasCenter = isSlotOpen('center')
  const hasBottom = isSlotOpen('bottom')

  const showLeftHandle = hasLeft && (hasCenter || hasBottom || hasRight)
  const showRightHandle = hasRight && (hasCenter || hasBottom)
  const showSplitHandle = !hasCenter && !hasBottom && hasLeft && hasRight
  const showBottomHandle = hasCenter && hasBottom
  // Esquineras diagonales: solo donde el cruce existe (handle inferior +
  // lateral abierto). Nunca en el borde exterior de abajo (ahí no hay qué
  // redimensionar).
  const showBottomLeftCorner = showBottomHandle && hasLeft
  const showBottomRightCorner = showBottomHandle && hasRight

  const isSharing = !hasCenter && !hasBottom
  const leftStyle: React.CSSProperties = isSharing
    ? { flex: '1 1 auto', flexBasis: leftWidth, minWidth: 0 }
    : { flex: '0 1 auto', width: leftWidth, minWidth: 0 }
  const rightStyle: React.CSSProperties = isSharing
    ? { flex: '1 1 auto', flexBasis: rightWidth, minWidth: 0 }
    : { flex: '0 1 auto', width: rightWidth, minWidth: 0 }

  const handleSplitResize = (newLeft: number): { left: number; right: number } => {
    const clampedLeft = clamp(newLeft, LEFT_MIN, LEFT_MAX)
    const delta = clampedLeft - leftWidth
    if (delta === 0) return { left: leftWidth, right: rightWidth }
    const desiredRight = rightWidth - delta
    const clampedRight = clamp(desiredRight, RIGHT_MIN, RIGHT_MAX)
    const actualDelta = rightWidth - clampedRight
    const finalLeft = clamp(leftWidth + actualDelta, LEFT_MIN, LEFT_MAX)
    if (finalLeft !== leftWidth + actualDelta) {
      const leftDelta = finalLeft - leftWidth
      const finalRight = clamp(rightWidth - leftDelta, RIGHT_MIN, RIGHT_MAX)
      return { left: finalLeft, right: finalRight }
    }
    return { left: finalLeft, right: clampedRight }
  }

  /** Esquinera izquierda: dx → ancho izquierdo, dy (invertido) → alto inferior. */
  const cornerLeftLive = (dx: number, dy: number): void => {
    writeSideLive('left', clamp(leftWidth + dx, LEFT_MIN, LEFT_MAX), isSharing)
    writeBottomLive(clamp(bottomHeight - dy, BOTTOM_MIN, BOTTOM_MAX))
  }
  const cornerLeftCommit = (dx: number, dy: number): void => {
    commitWidths({
      left: clamp(leftWidth + dx, LEFT_MIN, LEFT_MAX),
      bottom: clamp(bottomHeight - dy, BOTTOM_MIN, BOTTOM_MAX)
    })
  }

  /** Esquinera derecha: dx invertido → ancho derecho, dy invertido → alto inferior. */
  const cornerRightLive = (dx: number, dy: number): void => {
    writeSideLive('right', clamp(rightWidth - dx, RIGHT_MIN, RIGHT_MAX), isSharing)
    writeBottomLive(clamp(bottomHeight - dy, BOTTOM_MIN, BOTTOM_MAX))
  }
  const cornerRightCommit = (dx: number, dy: number): void => {
    commitWidths({
      right: clamp(rightWidth - dx, RIGHT_MIN, RIGHT_MAX),
      bottom: clamp(bottomHeight - dy, BOTTOM_MIN, BOTTOM_MAX)
    })
  }

  const hasAny = hasLeft || hasRight || hasCenter || hasBottom
  if (!hasAny) {
    return (
      <div className={styles.layout}>
        <p className={styles.empty} role="status" aria-live="polite">
          No hay panel activo
        </p>
      </div>
    )
  }

  const hasCenterColumn = hasCenter || hasBottom

  return (
    <div className={styles.layout}>
      {hasLeft ? (
        <SlotSection
          slot="left"
          className={cardClass(styles.slot, 'left')}
          style={leftStyle}
          sectionRef={setSectionEl('left')}
        />
      ) : null}

      {showLeftHandle && !showSplitHandle ? (
        <ResizeHandle
          label="Redimensionar panel izquierdo"
          value={leftWidth}
          min={LEFT_MIN}
          max={LEFT_MAX}
          onResize={setLeftWidth}
          onLive={(v) => writeSideLive('left', v, isSharing)}
          onCommit={(v) => commitWidths({ left: v })}
        />
      ) : null}

      {hasCenterColumn ? (
        <div className={styles.centerColumn}>
          {hasCenter ? (
            <main className={cardClass(styles.center, 'center')}>
              <SlotSection slot="center" className={styles.centerInner} />
            </main>
          ) : null}

          {showBottomHandle ? (
            <div className={styles.bottomHandleRow}>
              {showBottomLeftCorner ? (
                <CornerResizeHandle
                  label="Redimensionar panel izquierdo e inferior"
                  corner="left"
                  onLive={cornerLeftLive}
                  onCommit={cornerLeftCommit}
                />
              ) : null}
              <ResizeHandle
                label="Redimensionar panel inferior"
                value={bottomHeight}
                min={BOTTOM_MIN}
                max={BOTTOM_MAX}
                direction="horizontal"
                invert
                onResize={setBottomHeight}
                onLive={(v) => writeBottomLive(v)}
                onCommit={(v) => commitWidths({ bottom: v })}
              />
              {showBottomRightCorner ? (
                <CornerResizeHandle
                  label="Redimensionar panel derecho e inferior"
                  corner="right"
                  onLive={cornerRightLive}
                  onCommit={cornerRightCommit}
                />
              ) : null}
            </div>
          ) : null}

          {hasBottom ? (
            <section
              ref={setSectionEl('bottom')}
              className={cardClass(styles.slotBottom, 'bottom')}
              style={
                hasCenter
                  ? { height: bottomHeight, minHeight: BOTTOM_MIN, flex: '0 0 auto' }
                  : { flex: '1 1 0', minHeight: 0 }
              }
            >
              {showTerminalNodes ? (
                <TerminalNodesView onBack={() => setShowTerminalNodes(false)} />
              ) : (
                <SplitView
                  slot="bottom"
                  onAddTab={() => openNewTerminalTab('bottom')}
                  actions={[
                    {
                      id: 'terminal-nodes',
                      label: 'Vista de nodos',
                      title: 'Ver terminales en lienzo',
                      icon: <ProductIcon id="share" size={15} aria-hidden="true" />,
                      onClick: () => setShowTerminalNodes(true)
                    }
                  ]}
                />
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {showRightHandle && !showSplitHandle ? (
        <ResizeHandle
          label="Redimensionar panel derecho"
          value={rightWidth}
          min={RIGHT_MIN}
          max={RIGHT_MAX}
          invert
          onResize={setRightWidth}
          onLive={(v) => writeSideLive('right', v, isSharing)}
          onCommit={(v) => commitWidths({ right: v })}
        />
      ) : null}

      {showSplitHandle ? (
        <ResizeHandle
          label="Redimensionar paneles laterales"
          value={leftWidth}
          min={LEFT_MIN}
          max={LEFT_MAX}
          onResize={(v) => {
            const next = handleSplitResize(v)
            setLeftWidth(next.left)
            setRightWidth(next.right)
          }}
          onLive={(v) => {
            const next = handleSplitResize(v)
            writeSideLive('left', next.left, true)
            writeSideLive('right', next.right, true)
          }}
          onCommit={(v) => {
            const next = handleSplitResize(v)
            commitWidths({ left: next.left, right: next.right })
          }}
        />
      ) : null}

      {hasRight ? (
        <SlotSection
          slot="right"
          className={cardClass(styles.slot, 'right')}
          style={rightStyle}
          sectionRef={setSectionEl('right')}
        />
      ) : null}
    </div>
  )
}
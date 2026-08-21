import { useState, type JSX } from 'react'
import { useLayout } from '../../state'
import { getPanel } from '../../registry'
import { PanelFrame } from '../PanelFrame/PanelFrame'
import { PanelHost } from '../PanelHost/PanelHost'
import { Tabs } from '../Tabs/Tabs'
import { ResizeHandle } from '../ResizeHandle/ResizeHandle'
import styles from './PanelLayout.module.css'

const LEFT_DEFAULT = 260
const LEFT_MIN = 200
const LEFT_MAX = 440

const RIGHT_DEFAULT = 300
const RIGHT_MIN = 220
const RIGHT_MAX = 520

/**
 * Distribución de tres slots (izquierda / centro / derecha), totalmente
 * desacoplada de los contenidos: cada slot monta el panel que diga el
 * LayoutContext. Los slots laterales son redimensionables con un handle
 * capsular minimalista (ResizeHandle).
 */
export function PanelLayout(): JSX.Element {
  const { slots, setSlotPanel } = useLayout()
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT)
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT)

  const leftPanel = getPanel(slots.left)
  const centerPanel = getPanel(slots.center)
  const rightPanel = getPanel(slots.right)

  return (
    <div className={styles.layout}>
      {leftPanel ? (
        <section className={styles.slot} style={{ width: leftWidth }}>
          <PanelFrame
            title={leftPanel.title}
            closable={leftPanel.closable !== false}
            onClose={() => setSlotPanel('left', null)}
          >
            <PanelHost panelId={slots.left} />
          </PanelFrame>
        </section>
      ) : null}

      {leftPanel ? (
        <ResizeHandle
          label="Redimensionar panel izquierdo"
          value={leftWidth}
          min={LEFT_MIN}
          max={LEFT_MAX}
          onResize={setLeftWidth}
        />
      ) : null}

      <main className={styles.center}>
        <Tabs />
        {centerPanel ? (
          <PanelHost panelId={slots.center} />
        ) : (
          <p className={styles.empty}>Sin panel en el centro</p>
        )}
      </main>

      {rightPanel ? (
        <ResizeHandle
          label="Redimensionar panel derecho"
          value={rightWidth}
          min={RIGHT_MIN}
          max={RIGHT_MAX}
          invert
          onResize={setRightWidth}
        />
      ) : null}

      {rightPanel ? (
        <section className={styles.slot} style={{ width: rightWidth }}>
          <PanelFrame
            title={rightPanel.title}
            closable={rightPanel.closable !== false}
            onClose={() => setSlotPanel('right', null)}
          >
            <PanelHost panelId={slots.right} />
          </PanelFrame>
        </section>
      ) : null}
    </div>
  )
}
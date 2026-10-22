// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LayoutToggles — botones de la statusbar para activar/desactivar paneles.
 *
 * Son toggles de VISIBILIDAD del slot completo (no de un panel puntual):
 *  - Activo = el slot está abierto (strip existe, aunque esté vacío).
 *  - Click con slot abierto → lo oculta por completo (removeStrip + destroy
 *    de sesiones de terminal huérfanas).
 *  - Click con slot cerrado → abre el panel default de ese slot.
 *
 * El estado se lee del store real (isSlotOpen), no de la proyección legacy
 * `slots`: así un slot abierto pero vacío se ve activo y se puede ocultar.
 */

import { type ComponentType, type JSX } from 'react'
import { productIcon } from '@services/productIcons/components'
import { CenterPanelViewIcon } from '@ui'
import { useLayout, getLastPanelForSlot } from '@features/layout'
import type { SlotId } from '@features/layout'
import { getOrderedButtons } from '@features/activitybar'
import styles from './LayoutToggles.module.css'

import { t } from '@core/i18n'
/**
 * Por slot: ícono del estado inactivo (panel cerrado) y del estado activo
 * (panel abierto). El central usa el custom CenterPanelViewIcon con su prop
 * `active`; los laterales/inferior usan las variantes *Open por ID.
 */
const TOGGLES: Array<{
  slot: SlotId
  label: string
  Icon: ComponentType<{ size?: number }>
  OpenIcon: ComponentType<{ size?: number }>
}> = [
  {
    slot: 'left',
    get label() {
      return t('statusbar.toggle.left')
    },
    Icon: productIcon('panel-left'),
    OpenIcon: productIcon('panel-left-open')
  },
  {
    slot: 'bottom',
    get label() {
      return t('statusbar.toggle.bottom')
    },
    Icon: productIcon('panel-bottom'),
    OpenIcon: productIcon('panel-bottom-open')
  },
  {
    slot: 'center',
    get label() {
      return t('statusbar.toggle.center')
    },
    Icon: productIcon('center-panel'),
    OpenIcon: productIcon('center-panel')
  },
  {
    slot: 'right',
    get label() {
      return t('statusbar.toggle.right')
    },
    Icon: productIcon('panel-right'),
    OpenIcon: productIcon('panel-right-open')
  }
]

/** Panel default que se abre al re-activar un slot cerrado. */
const DEFAULT_PANELS: Record<SlotId, string> = {
  left: 'explorer',
  center: 'welcome',
  right: 'chat',
  bottom: 'innerta-terminal'
}

/**
 * Panel que se reabre en un slot: el último que el usuario tuvo abierto ahí
 * (si su botón de la ActivityBar sigue en ese lado, para seguir los movimientos
 * de botones entre barras), si no el primer botón de la ActivityBar de ese
 * lado, y como último recurso el default hardcodeado.
 */
function defaultPanelForSlot(slot: SlotId): string {
  if (slot === 'center') return 'welcome'
  if (slot === 'bottom') return 'innerta-terminal'
  const side = slot as 'left' | 'right'
  const remembered = getLastPanelForSlot(slot)
  const buttons = getOrderedButtons(side)
  if (remembered && buttons.some((b) => b.panelId === remembered)) {
    return remembered
  }
  const first = buttons[0]
  if (first?.panelId) return first.panelId
  return DEFAULT_PANELS[slot]
}

export function LayoutToggles(): JSX.Element {
  const { isSlotOpen, setSlotPanel, toggleSlotPanel } = useLayout()

  return (
    <div className={styles.group} role="group" aria-label={t('statusbar.visibilidad.de.paneles')}>
      {TOGGLES.map(({ slot, label, Icon, OpenIcon }) => {
        const open = isSlotOpen(slot)
        return (
          <button
            key={slot}
            type="button"
            className={[styles.btn, open ? styles.active : null].filter(Boolean).join(' ')}
            onClick={() => toggleSlot(slot)}
            title={`${open ? t('statusbar.ocultar') : t('statusbar.mostrar')} ${label.toLowerCase()}`}
            aria-label={label}
            aria-pressed={open}
          >
            {slot === 'center' ? (
              <CenterPanelViewIcon size={17} active={open} />
            ) : open ? (
              <OpenIcon size={17} />
            ) : (
              <Icon size={17} />
            )}
          </button>
        )
      })}
    </div>
  )

  /** Ocultar el slot completo si está abierto; si está cerrado, abrir el default. */
  function toggleSlot(slot: SlotId): void {
    if (isSlotOpen(slot)) {
      setSlotPanel(slot, null)
    } else {
      toggleSlotPanel(slot, defaultPanelForSlot(slot) as never)
    }
  }
}

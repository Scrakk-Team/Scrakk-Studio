/**
 * ModeLabel — indica el modo activo debajo del input: "Modo: {modo}".
 *
 * Al hacer click abre el menú global con todos los modos (integrados y
 * propios); el nombre se muestra en el color del modo.
 */

import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import type { ContextMenuItem } from '@ui'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { applyMode, getModeId, getModeLabel, getModeColor } from '@services/ai/prompts/modes'
import { modeRegistry } from '@services/ai/policy/modeRegistry'
import styles from './ModeLabel.module.css'

const ALIAS_MODE_IDS = new Set(['auto_edit', 'all_allow'])

export function ModeLabel(): JSX.Element {
  const [modeId, setModeId] = useState<string>(() => getModeId())

  useEffect(() => {
    const onChange = (): void => setModeId(getModeId())
    window.addEventListener('approval-mode-changed', onChange)
    return () => window.removeEventListener('approval-mode-changed', onChange)
  }, [])

  const openMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const items: ContextMenuItem[] = modeRegistry
      .getAll()
      .filter((mode) => !ALIAS_MODE_IDS.has(mode.id))
      .map((mode) => ({
        label: mode.label,
        sublabel: mode.description,
        checked: mode.id === modeId,
        onClick: () => applyMode(mode.id)
      }))
    // El label está pegado al fondo: el menú sube.
    showContextMenu(rect.left, rect.top, items, 'above')
  }

  return (
    <button type="button" className={styles.label} aria-haspopup="menu" onClick={openMenu}>
      Modo:{' '}
      <span className={styles.mode} style={{ color: getModeColor(modeId) }}>
        {getModeLabel(modeId)}
      </span>
      <ProductIcon id="chevron-down" size={10} className={styles.chevron} />
    </button>
  )
}

/**
 * ModeLabel — indica el modo activo debajo del input: "Modo: {modo}".
 * El nombre del modo se muestra en el color correspondiente.
 */

import { useEffect, useState, type JSX } from 'react'
import { getModeId, getModeLabel, getModeColor } from '@services/ai/prompts/modes'
import styles from './ModeLabel.module.css'

export function ModeLabel(): JSX.Element {
  const [modeId, setModeId] = useState<string>(() => getModeId())

  useEffect(() => {
    const onChange = (): void => setModeId(getModeId())
    window.addEventListener('approval-mode-changed', onChange)
    return () => window.removeEventListener('approval-mode-changed', onChange)
  }, [])

  return (
    <p className={styles.label} aria-live="polite">
      Modo: <span className={styles.mode} style={{ color: getModeColor(modeId) }}>{getModeLabel(modeId)}</span>
    </p>
  )
}

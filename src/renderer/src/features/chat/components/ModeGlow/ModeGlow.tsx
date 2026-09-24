// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ModeGlow — identificación visual del modo de aprobación.
 *
 * Una luz (glow) sale por la parte de abajo, detrás del input de chat, con
 * el COLOR del modo activo (plan=amarillo, default=azul, auto_edit=verde,
 * all_allow=rojo). Solo aparece fugazmente al cambiar de modo.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useShortcut } from '@services/shortcuts'
import { cycleMode, getModeColor, getModeId } from '@services/ai/prompts/modes'
import styles from './ModeGlow.module.css'

const MODE_CHANGED_EVENT = 'approval-mode-changed'

export function ModeGlow(): JSX.Element {
  const [color, setColor] = useState<string>(() => getModeColor(getModeId()))
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reaccionar a cambios de modo (shortcut, modal "Siempre aprobar", etc.).
  useEffect(() => {
    const onChange = (): void => {
      setColor(getModeColor(getModeId()))
      // Reiniciar animación: quitar clase, forzar reflow, volver a agregar.
      setVisible(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
      // Limpiar timer anterior y ocultar después de la animación.
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 1600)
    }
    window.addEventListener(MODE_CHANGED_EVENT, onChange)
    return () => {
      window.removeEventListener(MODE_CHANGED_EVENT, onChange)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleShiftTab = useCallback((event: KeyboardEvent): void => {
    event.preventDefault()
    cycleMode()
  }, [])

  // Primer shortcut del sistema: Shift+Tab cicla el modo de aprobación.
  useShortcut('shift+tab', handleShiftTab, { preventDefault: true })

  return (
    <div
      className={`${styles.glow} ${visible ? styles.glowVisible : ''}`}
      style={{ background: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)` }}
      aria-hidden="true"
    />
  )
}

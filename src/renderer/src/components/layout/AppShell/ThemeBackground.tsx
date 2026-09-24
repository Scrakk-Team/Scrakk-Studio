// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import { getActiveThemeBackground, subscribeToThemes, type ThemeBackground } from '@services/extensions'
import styles from './ThemeBackground.module.css'

/**
 * Fondo con imagen del theme (eye-dark): capa fija detrás de TODO el chrome
 * (titlebar, activitybars, slots, statusbar). Solo se renderiza si el tema
 * activo trae `colors.background` con imagen; el resto de temas no cambia
 * nada. Las superficies translúcidas del tema dejan verla a través.
 */
export function ThemeBackground(): JSX.Element | null {
  const [background, setBackground] = useState<ThemeBackground | null>(() =>
    getActiveThemeBackground()
  )

  useEffect(() => subscribeToThemes(() => setBackground(getActiveThemeBackground())), [])

  if (!background) return null

  return <div className={styles.layer} data-theme-bg="" aria-hidden="true" />
}

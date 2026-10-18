// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import {
  getActiveThemeBackground,
  subscribeToThemes,
  type ThemeBackground as ThemeBackgroundDef
} from '@services/extensions'
import { OverlayHost } from '@services/events/OverlayHost'
import { getActiveOverlayLayer, subscribeToActiveEvent } from '@services/events/runtime'
import styles from './ThemeBackground.module.css'

/**
 * Fondo del theme: capa fija detrás de TODO el chrome (titlebar, activitybars,
 * slots, statusbar). Puede ser una imagen (`type: "image"`) o un overlay que
 * aporta el mismo pack (`type: "overlay"`); en ambos casos las superficies
 * translúcidas del tema dejan verlo.
 *
 * Si hay un evento con fondo propio, ese gana mientras dura: el evento monta
 * su overlay en `OverlayHost layer="background"` y acá no duplicamos el tema.
 */
export function ThemeBackground(): JSX.Element | null {
  const [background, setBackground] = useState<ThemeBackgroundDef | null>(() =>
    getActiveThemeBackground()
  )
  const [eventBackground, setEventBackground] = useState(() =>
    getActiveOverlayLayer('background')
  )

  useEffect(() => subscribeToThemes(() => setBackground(getActiveThemeBackground())), [])
  useEffect(
    () => subscribeToActiveEvent(() => setEventBackground(getActiveOverlayLayer('background'))),
    []
  )

  if (!background) return null

  if (background.type === 'overlay') {
    // El fondo del evento tiene prioridad y ya está montado por OverlayHost.
    if (eventBackground) return null
    return (
      <div className={styles.overlay} style={{ opacity: background.opacity ?? 1 }}>
        <OverlayHost layer="background" overlayId={background.overlay} />
      </div>
    )
  }

  return <div className={styles.layer} data-theme-bg="" aria-hidden="true" />
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, type JSX, type MouseEvent } from 'react'
import { MenuBar } from './components/MenuBar/MenuBar'
import { WidgetContainer } from './widgets/WidgetContainer'
import { useWindowControls } from './hooks/useWindowControls'
import { subscribeToThemes } from '@services/extensions'
import styles from './Titlebar.module.css'

/**
 * Colores del overlay leídos del tema ACTIVO (vars computadas — sirve para
 * builtins SEF y VSIX convertidos, sin tabla dark/light hardcodeada).
 */
function readOverlayColors(): { color: string; symbolColor: string } {
  const cs = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string): string =>
    cs.getPropertyValue(name).trim() || fallback
  return {
    color: read('--titlebar-bg', read('--color-surface', '#101010')),
    symbolColor: read('--color-text-secondary', '#b8b8b8')
  }
}

interface TitlebarProps {
  /** Abre el modal de ajustes (estado vive en App, compartido con el StatusBar). */
  onOpenSettings?: () => void
}

/**
 * Titlebar custom. Izquierda: menús de la app (Archivo/Editar/Ver/Ayuda…)
 * + widgets modulares (Workspaces…). Los botones nativos de ventana
 * (min/max/close) los dibuja el OS vía `titleBarOverlay` encima de esta
 * barra; el CSS reserva el área con `env(titlebar-area-*)`.
 */
export function Titlebar(_props: TitlebarProps): JSX.Element {
  const { toggleMaximize } = useWindowControls()

  // Mantener el color del overlay sincronizado con el tema activo:
  // re-lee las vars computadas en cada cambio (activar/desactivar/uninstall).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      window.api?.windowControls.setTitleBarOverlay(readOverlayColors())
    })
    return () => cancelAnimationFrame(raf)
  }, [])
  useEffect(() => subscribeToThemes(() => {
    window.api?.windowControls.setTitleBarOverlay(readOverlayColors())
  }), [])

  const handleDoubleClick = (event: MouseEvent<HTMLElement>): void => {
    // Ignorar doble click sobre menús y botones: solo la zona de drag maximiza.
    if ((event.target as HTMLElement).closest('button')) return
    toggleMaximize()
  }

  return (
    <header className={styles.titlebar} onDoubleClick={handleDoubleClick}>
      <div className={styles.content}>
        <div className={styles.left}>
          <MenuBar />
        </div>
        <div className={styles.center}>
          <WidgetContainer />
        </div>
        <div className={styles.trailing} />
      </div>
    </header>
  )
}
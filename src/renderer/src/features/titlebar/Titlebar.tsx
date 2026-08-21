import { useEffect, type JSX, type MouseEvent } from 'react'
import { useTheme } from '@core/theme/ThemeProvider'
import { MenuBar } from './components/MenuBar/MenuBar'
import { useWindowControls } from './hooks/useWindowControls'
import styles from './Titlebar.module.css'

/** Colores del overlay de botones nativos por tema (match con themes.css). */
const OVERLAY_BY_THEME = {
  dark: { color: '#101010', symbolColor: '#b8b8b8' },
  light: { color: '#f7f7f7', symbolColor: '#555555' }
} as const

interface TitlebarProps {
  /** Abre el modal de ajustes (estado vive en App, compartido con el StatusBar). */
  onOpenSettings?: () => void
}

/**
 * Titlebar custom. Izquierda: menús de la app (Archivo/Editar/Ver/Ayuda).
 * Los botones nativos de ventana (min/max/close) los dibuja el OS vía
 * `titleBarOverlay` encima de esta barra; el CSS reserva el área con
 * `env(titlebar-area-*)`.
 */
export function Titlebar(_props: TitlebarProps): JSX.Element {
  const { theme } = useTheme()
  const { toggleMaximize } = useWindowControls()

  // Mantener el color del overlay sincronizado con el tema de la UI.
  useEffect(() => {
    window.api?.windowControls.setTitleBarOverlay(OVERLAY_BY_THEME[theme])
  }, [theme])

  const handleDoubleClick = (event: MouseEvent<HTMLElement>): void => {
    // Ignorar doble click sobre menús y botones: solo la zona de drag maximiza.
    if ((event.target as HTMLElement).closest('button')) return
    toggleMaximize()
  }

  return (
    <header className={styles.titlebar} onDoubleClick={handleDoubleClick}>
      <div className={styles.content}>
        <MenuBar />
      </div>
    </header>
  )
}
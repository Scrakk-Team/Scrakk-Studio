import { useEffect, type JSX, type ReactNode } from 'react'
import { TooltipHost } from '@services/tooltips'
import { NotificationHost } from '@features/notifications/NotificationHost'
import { ModalHost } from '@features/modals/ModalHost'
import { SubagentOpenBridge } from '@features/chat/agents'
import { ProfileFloatingHost } from '@features/social/components/ProfileFloating/ProfileFloating'
import { installDefaultContextMenu } from '@features/editor/engines/innerta/menuHost'
import { ThemeBackground } from './ThemeBackground'
import styles from './AppShell.module.css'

interface AppShellProps {
  children: ReactNode
}

/**
 * Módulo de layout — estructura base de la ventana:
 * titlebar arriba + contenido que llena el resto.
 */
export function AppShell({ children }: AppShellProps): JSX.Element {
  // Fallback global de click derecho (Copiar/Pegar/Seleccionar todo) en
  // componentes sin menú propio. 1× por montaje, con cleanup.
  useEffect(() => installDefaultContextMenu(), [])

  return (
    <div className={styles.shell}>
      <ThemeBackground />
      {children}
      <TooltipHost />
      <NotificationHost />
      <ModalHost />
      <SubagentOpenBridge />
      <ProfileFloatingHost />
    </div>
  )
}

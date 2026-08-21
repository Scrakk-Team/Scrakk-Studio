import { useState, type JSX } from 'react'
import { AppShell } from '@layout/AppShell'
import { ChatsProvider, ToolConfirmationModal } from '@features/chat'
import {
  ProvidersProvider,
  ProvidersModal,
  useProviders
} from '@features/providers'
import {
  LayoutProvider,
  PanelLayout,
  LayoutShortcuts
} from '@features/layout'
import { StatusBar } from '@features/statusbar'
import { SettingsModal } from '@features/settings'
import { ActivityBar } from '@features/activitybar'
import { Titlebar } from '@features/titlebar'

/**
 * Modal de proveedores montado UNA vez a nivel global: el estado del modal
 * vive en el ProvidersContext, así que cualquier trigger (status bar, panel
 * de historial) lo abre sin duplicar el overlay.
 */
function ProvidersModalHost(): JSX.Element {
  const { isProvidersModalOpen, closeProvidersModal } = useProviders()
  return <ProvidersModal open={isProvidersModalOpen} onClose={closeProvidersModal} />
}

/**
 * Raíz de la app: composición de módulos.
 * - ProvidersProvider: proveedores de LLM detectados + API keys.
 * - ChatsProvider: estado real de conversaciones que comparten el chat
 *   (ChatPanel) y el historial (HistoryPanel).
 * - LayoutProvider: sistema de layouts modular — tres slots (izquierda /
 *   centro / derecha) donde se montan paneles registrados. Nada hardcodeado:
 *   cualquier componente registrado en `features/layout/registry` puede vivir
 *   en cualquier slot.
 * - ActivityBar: barras laterales (izq/der) que activan/desactivan paneles.
 * - StatusBar: barra inferior de estado (proveedor/modelo, contadores, tema,
 *   ajustes).
 */
export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = (): void => setSettingsOpen(true)
  const closeSettings = (): void => setSettingsOpen(false)

  return (
    <ProvidersProvider>
      <ChatsProvider>
        <AppShell>
          <LayoutProvider>
            <LayoutShortcuts />
            <Titlebar onOpenSettings={openSettings} />
            <div className="app-workspace">
              <ActivityBar side="left" />
              <PanelLayout />
              <ActivityBar side="right" />
            </div>
            <StatusBar onOpenSettings={openSettings} />
          </LayoutProvider>
          {/* Confirmaciones del policy engine (tools de mutación/riesgo). */}
          <ToolConfirmationModal />
          <SettingsModal open={settingsOpen} onClose={closeSettings} />
          <ProvidersModalHost />
        </AppShell>
      </ChatsProvider>
    </ProvidersProvider>
  )
}
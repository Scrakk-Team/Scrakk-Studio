/**
 * Feature ToolDock — píldora horizontal de botones + panel flotante que
 * CUALQUIER panel puede montar con <ToolDock /> (dentro de un
 * ToolDockHostProvider). Nada fijo: botones y paneles se registran por API
 * y declaran en qué hosts aparecen.
 *
 * Uso (host):
 *   import { ToolDock, ToolDockHostProvider } from '@features/tooldock'
 *   <ToolDockHostProvider hostId="explorer"><ToolDock /></ToolDockHostProvider>
 *
 * Uso (contribuir):
 *   registerToolDockItem({ id, kind: 'panel', title, icon, hosts: ['explorer'], component })
 */

export { ToolDock } from './components/ToolDock'
export { ToolDockHostProvider, useToolDockHost, useToolDockHostInfo } from './state/ToolDockHostContext'
export {
  registerToolDockItem,
  unregisterToolDockItem,
  subscribeToToolDockItems,
  getToolDockItemsForHost
} from './registry'

// Auto-registro de items builtin al consumir el feature (import único vía
// aquí para evitar ciclos registry → items → registry).
import './items'
export type {
  ToolDockItem,
  ToolDockHostInfo,
  ToolDockPanelProps,
  DockEntry
} from './types'

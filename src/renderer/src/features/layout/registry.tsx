import { lazy } from 'react'
import { ExtensionRegistry } from '@services/extensions'
import type { PanelEntry, PanelId } from './types'

/**
 * Registro de paneles del sistema de layouts.
 *
 * Cualquier componente .tsx puede convertirse en panel: se registra acá con
 * su ruta de import y el PanelHost lo carga de forma perezosa (lazy) dentro
 * de su propio ErrorBoundary. Si ese panel peta, SOLO ese panel muestra el
 * error; el resto de la app sigue viva.
 */
export const PANEL_REGISTRY: Record<PanelId, PanelEntry> = {
  editor: {
    id: 'editor',
    title: 'Editor',
    component: lazy(() =>
      import('@features/editor').then((module) => ({
        default: module.EditorPanel
      }))
    )
  },
  chat: {
    id: 'chat',
    title: 'Chat',
    component: lazy(() =>
      import('./panels/ChatPanel/ChatPanel').then((module) => ({
        default: module.ChatPanel
      }))
    )
  },
  history: {
    id: 'history',
    title: 'Historial',
    component: lazy(() =>
      import('./panels/HistoryPanel/HistoryPanel').then((module) => ({
        default: module.HistoryPanel
      }))
    )
  },
  welcome: {
    id: 'welcome',
    title: 'Bienvenida',
    component: lazy(() =>
      import('./panels/WelcomePanel/WelcomePanel').then((module) => ({
        default: module.WelcomePanel
      }))
    )
  },
  explorer: {
    id: 'explorer',
    title: 'Explorador',
    // El explorador es permanente: sin X en el header.
    closable: false,
    component: lazy(() =>
      import('@features/explorer').then((module) => ({
        default: module.ExplorerPanel
      }))
    )
  }
}

/**
 * Devuelve la entrada registrada para un id (o null si no existe).
 * Los paneles built-in viven en PANEL_REGISTRY; los de extensiones se
 * consultan en el ExtensionRegistry (fusionados, nada hardcodeado). El
 * PanelHost los monta igual: lazy + ErrorBoundary por panel.
 */
export function getPanel(id: PanelId | null | undefined): PanelEntry | null {
  if (!id) return null
  return PANEL_REGISTRY[id] ?? ExtensionRegistry.getPanel(id)
}

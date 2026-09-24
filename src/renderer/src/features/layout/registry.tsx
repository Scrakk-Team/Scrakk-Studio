// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ComponentType } from 'react'
import { ExtensionRegistry } from '@services/extensions'
import {
  loadedPanel,
  preloadPanelEntry,
  preloadPanelsLazily
} from './components/PanelHost/panelModules'
import type { PanelEntry, PanelId } from './types'

/**
 * Registro de paneles del sistema de layouts.
 *
 * Cualquier componente .tsx puede convertirse en panel: se registra aquí con su
 * IMPORT DINÁMICO y el `PanelHost` lo monta dentro de su propio ErrorBoundary.
 * Si ese panel peta, SOLO ese panel muestra el error; el resto de la app sigue
 * viva.
 *
 * Por qué un import dinámico y no `React.lazy`: con `lazy` + `Suspense` el
 * panel se quedaba en "Cargando panel…" para siempre cuando el módulo llegaba
 * después del render que suspendió (medido; ver
 * `components/PanelHost/panelModules.ts`). Con `load` el panel monta cuando la
 * promesa resuelve, y `preloadPanel` lo deja listo ANTES del click.
 */

/** Definición corta de un panel built-in: id + título + import dinámico. */
function panel(
  id: PanelId,
  title: string,
  load: () => Promise<ComponentType>,
  extra?: { closable?: boolean }
): PanelEntry {
  return { id, title, load, ...extra }
}

export const PANEL_REGISTRY: Record<PanelId, PanelEntry> = {
  editor: panel('editor', 'Editor', () =>
    import('@features/editor').then((module) => module.EditorPanel)
  ),
  // El chat es permanente: el + de nuevo chat vive en su header.
  chat: panel(
    'chat',
    'Chat',
    () => import('./panels/ChatPanel/ChatPanel').then((module) => module.ChatPanel),
    { closable: false }
  ),
  // El historial ya NO tiene botón en la activity bar ni se abre como panel
  // suelto: es una vista embebida DENTRO del Panel de Chat (ver ChatPanel +
  // HistoryPanel/viewState). Sigue registrado porque el registry es la lista
  // de paneles montables y varios tests lo usan como panel de ejemplo; sin
  // entrada en la barra ni comando que lo spawnee, no hay forma de abrirlo
  // aparte.
  history: panel('history', 'Historial', () =>
    import('./panels/HistoryPanel/HistoryPanel').then((module) => module.HistoryPanel)
  ),
  welcome: panel('welcome', 'Bienvenida', () =>
    import('./panels/WelcomePanel/WelcomePanel').then((module) => module.WelcomePanel)
  ),
  // El explorador es permanente: sin X en el header.
  explorer: panel(
    'explorer',
    'Explorador',
    () => import('@features/explorer').then((module) => module.ExplorerPanel),
    { closable: false }
  ),
  search: panel('search', 'Búsqueda', () =>
    import('./panels/SearchPanel/SearchPanel').then((module) => module.SearchPanel)
  ),
  git: panel('git', 'Git', () =>
    import('./panels/GitPanel/GitPanel').then((module) => module.GitPanel)
  ),
  browser: panel('browser', 'Browser', () =>
    import('./panels/BrowserPanel/BrowserPanel').then((module) => module.BrowserPanel)
  ),
  notes: panel('notes', 'Notas', () =>
    import('./panels/NotePanel/NotePanel').then((module) => module.NotePanel)
  ),
  debug: panel('debug', 'Debug', () =>
    import('./panels/DebugPanel/DebugPanel').then((module) => module.DebugPanel)
  ),
  // Problemas: los diagnósticos de language servers Y de extensiones en una
  // sola lista (es el panel que abre el chip de la barra de estado).
  problems: panel('problems', 'Problemas', () =>
    import('./panels/ProblemsPanel/ProblemsPanel').then((module) => module.ProblemsPanel)
  ),
  social: panel('social', 'Social', () =>
    import('./panels/SocialPanel/SocialPanel').then((module) => module.SocialPanel)
  )
}

/**
 * Devuelve la entrada registrada para un id (o null si no existe).
 * Los paneles built-in viven en PANEL_REGISTRY; los de extensiones se
 * consultan en el ExtensionRegistry (fusionados, nada hardcodeado). El
 * PanelHost los monta igual: en su ErrorBoundary, sin Suspense.
 */
export function getPanel(id: PanelId | null | undefined): PanelEntry | null {
  if (!id) return null
  return PANEL_REGISTRY[id] ?? ExtensionRegistry.getPanel(id)
}

/**
 * PRECARGA el módulo de un panel (fire and forget). Idempotente y barato: el
 * primer click sobre un panel precalentado es un cache hit, sin descarga ni
 * fallback.
 *
 * Se llama desde el hover/pointerdown de los botones de la activity bar (hay
 * intención) y desde el preload por idle del arranque.
 */
export function preloadPanel(id: PanelId | null | undefined): void {
  preloadPanelEntry(getPanel(id))
}

/**
 * Precarga TODOS los paneles built-in. Se llama en idle, después del primer
 * paint: en Electron los chunks son archivos locales (lectura de disco), así
 * que calentarlos no cuesta red y convierte cualquier apertura en instantánea.
 *
 * Va por la cola SERIAL (`preloadPanelsLazily`), no en paralelo: en dev cada
 * import es un árbol de cientos de módulos sueltos y lanzarlos todos juntos
 * saturaba Vite y el renderer, dejando al panel que el usuario abría detrás de
 * esa avalancha. Los paneles de extensión quedan afuera: su carga depende del
 * Extension Host.
 */
export function preloadAllPanels(): void {
  preloadPanelsLazily(Object.values(PANEL_REGISTRY))
}

/** ¿El módulo de este panel ya está cargado (montaje instantáneo)? */
export function isPanelLoaded(id: PanelId): boolean {
  return loadedPanel(id) !== null
}

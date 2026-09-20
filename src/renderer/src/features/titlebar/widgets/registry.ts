import { lazy, type LazyExoticComponent, type ComponentType } from 'react'

/**
 * Registro de widgets de la titlebar — el "widgetcontainer".
 *
 * Cualquier componente .tsx puede convertirse en widget: se registra aquí con
 * su id y el WidgetContainer lo carga de forma perezosa (lazy) dentro del
 * ErrorBoundary de layouts. Si ese widget peta, SOLO ese widget muestra el
 * fallback; el resto de la titlebar sigue viva.
 *
 * FORMA PARTE del sistema de layouts: los widgets se pintan con el mismo
 * aislamiento de errores por panel (`PanelErrorBoundary`) y usan el mismo
 * servicio global de modales anclados que el resto de la app.
 *
 * CONTRATO DE TAMAÑO (la titlebar mide 38px de alto):
 * - Altura del widget: 24px (misma que los botones del MenuBar).
 * - Ancho: flexible con tope — el nombre/etiqueta usa ellipsis
 *   (`max-width` + `overflow: hidden` + `text-overflow: ellipsis`).
 * - Sin fondos propios llamativos: mismo lenguaje que los botones de la
 *   titlebar (texto secondary, hover sutil, radius-input).
 * - Los widgets son interactivos: viven fuera de la región de drag
 *   (el container ya trae `-webkit-app-region: no-drag`).
 */
export interface TitlebarWidgetEntry {
  id: string
  /** Título accesible del widget. */
  title: string
  /** Orden de pintado (menor primero). */
  order?: number
  component: LazyExoticComponent<ComponentType>
}

export const TITLEBAR_WIDGET_REGISTRY: Record<string, TitlebarWidgetEntry> = {
  workspaces: {
    id: 'workspaces',
    title: 'Workspaces',
    order: 10,
    component: lazy(() =>
      import('./workspaces/WorkspacesWidget').then((module) => ({
        default: module.WorkspacesWidget
      }))
    )
  }
}

/** Widgets ordenados por `order` (estable por id). */
export function getTitlebarWidgets(): TitlebarWidgetEntry[] {
  return Object.values(TITLEBAR_WIDGET_REGISTRY).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)
  )
}

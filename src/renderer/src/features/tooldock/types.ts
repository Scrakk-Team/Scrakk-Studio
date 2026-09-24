// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ToolDock — tipos públicos del feature.
 *
 * El ToolDock es una píldora flotante horizontal de botones que CUALQUIER
 * panel puede montar (opt-in via <ToolDock hostId="…" />). Nada fijo: los
 * botones y paneles se declaran como ToolDockItem en el registry y cada uno
 * declara EN QUÉ hosts aparece (hosts: array de hostIds o predicado).
 */

import type { ComponentType, LazyExoticComponent } from 'react'
import type { ActivityBarButton, ButtonSide } from '@features/activitybar'

/**
 * Contexto de un host montado: lo reciben los items para filtrar y para
 * reaccionar (ej. outline/timeline usan currentFile).
 */
export interface ToolDockHostInfo {
  /** Id del host que montó el dock (ej. 'explorer'). */
  hostId: string
  /** Archivo activo del editor (null si no hay). */
  currentFile: { path: string; name: string } | null
}

/** Props que el ToolDock inyecta al componente de un item 'panel'. */
export interface ToolDockPanelProps {
  hostId: string
  currentFile: { path: string; name: string } | null
}

/**
 * Item del ToolDock: botón (acción inmediata) o panel (abre el panel
 * flotante encima del dock).
 */
export interface ToolDockItem {
  /** Id único (prefijo del feature recomendado, ej. 'outline'). */
  id: string
  kind: 'button' | 'panel'
  /** Tooltip / aria-label. */
  title: string
  /** Id de ProductIcon (proicons) — cero SVGs hardcodeados. */
  icon: string
  /** Orden dentro del dock (ascendente; default 100). */
  order?: number
  /**
   * En qué hosts aparece: array de hostIds o predicado sobre el contexto.
   * Vacío/omiso = no aparece en ningún host (hasta que lo monten con match).
   */
  hosts?: string[] | ((ctx: ToolDockHostInfo) => boolean)
  /** Solo kind='panel': contenido del panel flotante (lazy o directo). */
  component?: ComponentType<ToolDockPanelProps> | LazyExoticComponent<ComponentType<ToolDockPanelProps>>
  /** Solo kind='button': acción al click. */
  onActivate?: (ctx: ToolDockHostInfo) => void
}

/** Botón del dock derivado de un ActivityBarButton dockeado (side 'toolDock'). */
export interface DockedActivityButton {
  kind: 'activity'
  button: ActivityBarButton
  side: ButtonSide
}

/** Entrada de botón ya resuelta para render en un host. */
export type DockEntry =
  | { kind: 'activity'; button: ActivityBarButton }
  | { kind: 'item'; item: ToolDockItem }

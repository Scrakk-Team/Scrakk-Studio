// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Items builtin del ToolDock — se registran solos al importar este módulo
 * (el registry lo hace). Cada item declara sus hosts: nada hardcodeado en
 * los paneles que montan el dock.
 */

import { registerToolDockItem } from '../registry'
import OutlinePanel from './outline/OutlinePanel'
import TimelinePanel from './timeline/TimelinePanel'
import BookmarksPanel from './bookmarks/BookmarksPanel'

export function registerBuiltinToolDockItems(): void {
  registerToolDockItem({
    id: 'outline',
    kind: 'panel',
    title: 'Esquema',
    icon: 'code',
    order: 10,
    hosts: ['explorer'],
    component: OutlinePanel
  })

  registerToolDockItem({
    id: 'timeline',
    kind: 'panel',
    title: 'Línea de tiempo',
    icon: 'history',
    order: 20,
    hosts: ['explorer'],
    component: TimelinePanel
  })

  registerToolDockItem({
    id: 'bookmarks',
    kind: 'panel',
    title: 'Marcadores',
    icon: 'bookmark',
    order: 30,
    hosts: ['explorer'],
    component: BookmarksPanel
  })
}

// Auto-registro al importar (idempotente: Map sobrescribe por id).
registerBuiltinToolDockItems()

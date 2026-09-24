// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Registry de secciones de Ajustes.
 *
 * Cada apartado vive en su propia carpeta (o archivo plano, como
 * AppearanceSection) y aquí solo se declara su metadata de nav + el
 * componente que lo pinta. Agregar una sección = crear su carpeta y
 * sumar una entrada a SETTINGS_SECTIONS; el modal no cambia.
 */

import type { ComponentType } from 'react'
import { AppearanceSection } from './AppearanceSection'
import { EditorSection } from './EditorSection/EditorSection'
import { ExtensionsSection } from './ExtensionsSection'
import { PerformanceSection } from './PerformanceSection/PerformanceSection'
import { ServersSection } from './ServersSection/ServersSection'
import { HighlightSection } from './HighlightSection/HighlightSection'
import { InfoSection } from './InfoSection/InfoSection'
import { ChatSection, ProvidersSection, ToolsSection, SkillsSection, AgentsSection, PermissionsSection } from './chat'

export type SettingsSectionId =
  | 'appearance'
  | 'editor'
  | 'extensions'
  | 'performance'
  | 'servers'
  | 'highlight'
  | 'chat'
  | 'chatProviders'
  | 'chatTools'
  | 'chatSkills'
  | 'chatAgents'
  | 'chatPermissions'
  | 'info'

export interface SettingsSectionDef {
  id: SettingsSectionId
  label: string
  /** Id del ProductIcon del nav. */
  icon: string
  /** Id del padre si es hija desplegable (ej. Resaltado ⊂ Servidores). */
  parent?: SettingsSectionId
  component: ComponentType
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: 'appearance', label: 'Apariencia', icon: 'grid', component: AppearanceSection },
  { id: 'editor', label: 'Editor', icon: 'code', component: EditorSection },
  { id: 'extensions', label: 'Extensiones', icon: 'extensions', component: ExtensionsSection },
  { id: 'performance', label: 'Rendimiento', icon: 'chart', component: PerformanceSection },
  { id: 'servers', label: 'Servidores', icon: 'server', component: ServersSection },
  { id: 'highlight', label: 'Resaltado', icon: 'code', parent: 'servers', component: HighlightSection },
  { id: 'chat', label: 'Chat', icon: 'chat', component: ChatSection },
  { id: 'chatProviders', label: 'Proveedores', icon: 'server', parent: 'chat', component: ProvidersSection },
  { id: 'chatTools', label: 'Herramientas', icon: 'grid', parent: 'chat', component: ToolsSection },
  { id: 'chatSkills', label: 'Skills', icon: 'layers', parent: 'chat', component: SkillsSection },
  { id: 'chatAgents', label: 'Agentes', icon: 'people', parent: 'chat', component: AgentsSection },
  { id: 'chatPermissions', label: 'Permisos', icon: 'shield-check', parent: 'chat', component: PermissionsSection },
  { id: 'info', label: 'Acerca de', icon: 'info', component: InfoSection }
]

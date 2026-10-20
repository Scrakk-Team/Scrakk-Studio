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
import { t, type MessageKey } from '@core/i18n'
import { AppearanceSection } from './AppearanceSection'
import { EditorSection } from './EditorSection/EditorSection'
import { ExtensionsSection } from './ExtensionsSection'
import { PerformanceSection } from './PerformanceSection/PerformanceSection'
import { ServersSection } from './ServersSection/ServersSection'
import { HighlightSection } from './HighlightSection/HighlightSection'
import { TerminalSection } from './TerminalSection/TerminalSection'
import { InfoSection } from './InfoSection/InfoSection'
import { LegalSection } from './LegalSection/LegalSection'
import { ShortcutsSection } from './ShortcutsSection/ShortcutsSection'
import { ChatSection, ProvidersSection, ToolsSection, SkillsSection, AgentsSection, PermissionsSection } from './chat'

export type SettingsSectionId =
  | 'appearance'
  | 'shortcuts'
  | 'editor'
  | 'extensions'
  | 'performance'
  | 'servers'
  | 'highlight'
  | 'terminal'
  | 'chat'
  | 'chatProviders'
  | 'chatTools'
  | 'chatSkills'
  | 'chatAgents'
  | 'chatPermissions'
  | 'info'
  | 'legal'

export interface SettingsSectionDef {
  id: SettingsSectionId
  label: string
  /** Id del ProductIcon del nav. */
  icon: string
  /** Id del padre si es hija desplegable (ej. Resaltado ⊂ Servidores). */
  parent?: SettingsSectionId
  /**
   * Oculta del nav SIN borrar la sección: sigue resolviéndose por id (enlaces
   * internos, `openSettingsModal('performance')`) y su componente sigue
   * montado. Para sacarla de verdad, borrar su entrada.
   */
  hidden?: boolean
  component: ComponentType
}

/** Definición corta de una sección: id + clave de label + icono + componente. */
function section(
  id: SettingsSectionId,
  labelKey: MessageKey,
  icon: string,
  component: ComponentType,
  parent?: SettingsSectionId
): SettingsSectionDef {
  return {
    id,
    icon,
    parent,
    component,
    // Getter: el label sigue al idioma activo sin tocar los consumidores.
    get label() {
      return t(labelKey)
    }
  }
}

/** Igual que `section(...)`, pero fuera del nav (la sección sigue existiendo). */
function hiddenSection(...args: Parameters<typeof section>): SettingsSectionDef {
  return { ...section(...args), hidden: true }
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  section('appearance', 'settings.nav.appearance', 'grid', AppearanceSection),
  section('editor', 'settings.nav.editor', 'code', EditorSection),
  section('shortcuts', 'settings.nav.shortcuts', 'keyboard', ShortcutsSection),
  section('servers', 'settings.nav.servers', 'server', ServersSection, 'editor'),
  section('highlight', 'settings.nav.highlight', 'code', HighlightSection, 'editor'),
  // Oculto a pedido: el selector de fuente era su único contenido. El setting
  // persistido y el código quedan (nada que lo lea se rompe); sólo no se navega.
  hiddenSection('terminal', 'settings.nav.terminal', 'terminal', TerminalSection),
  section('extensions', 'settings.nav.extensions', 'extensions', ExtensionsSection),
  // Oculto por pedido (queda el código, no se muestra en el nav).
  hiddenSection('performance', 'settings.nav.performance', 'chart', PerformanceSection),
  section('chat', 'settings.nav.chat', 'chat', ChatSection),
  section('chatProviders', 'settings.nav.providers', 'server', ProvidersSection, 'chat'),
  section('chatTools', 'settings.nav.tools', 'grid', ToolsSection, 'chat'),
  section('chatSkills', 'settings.nav.skills', 'layers', SkillsSection, 'chat'),
  section('chatAgents', 'settings.nav.agents', 'people', AgentsSection, 'chat'),
  section('chatPermissions', 'settings.nav.permissions', 'shield-check', PermissionsSection, 'chat'),
  section('info', 'settings.nav.info', 'info', InfoSection),
  section('legal', 'settings.nav.legal', 'file', LegalSection)
]

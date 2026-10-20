// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Paneles que se abren con un atajo — DATA pura.
 *
 * Vive aparte de `CommandsBridge.tsx` a propósito: el componente importa la
 * cadena de layout/React (y el test de las invariantes no debe arrastrarla).
 * Agregar un panel = una línea acá; no hay handlers sueltos ni atajos
 * hardcodeados en los botones del dock o de la barra.
 */

import { t } from '@core/i18n'

export interface LayoutToggleDef {
  id: string
  title: string
  slot: 'left' | 'right' | 'center' | 'bottom'
  panelId: string
  keybinding?: string
}

/**
 * Paneles de la barra/dock que se pueden abrir con un atajo. DATA: agregar un
 * panel = una línea acá (no hay handlers sueltos ni atajos hardcodeados en los
 * botones). El id `layout.toggle<Panel>` es el que usa la paleta y Ajustes.
 */
export const LAYOUT_TOGGLES: LayoutToggleDef[] = [
  { id: 'layout.toggleChat', get title() { return t('layout.mostrar.ocultar.chat') }, slot: 'right', panelId: 'chat', keybinding: 'mod+j' },
  { id: 'layout.toggleExplorer', get title() { return t('layout.mostrar.ocultar.explorador') }, slot: 'left', panelId: 'explorer', keybinding: 'mod+b' },
  { id: 'layout.toggleSearch', get title() { return t('layout.panel.search') }, slot: 'left', panelId: 'search', keybinding: 'mod+shift+f' },
  { id: 'layout.toggleExtensions', get title() { return t('layout.panel.extensions') }, slot: 'left', panelId: 'extensions', keybinding: 'mod+shift+x' },
  { id: 'layout.toggleBrowser', get title() { return t('layout.panel.browser') }, slot: 'left', panelId: 'browser', keybinding: 'mod+alt+b' },
  { id: 'layout.toggleDebug', get title() { return t('layout.panel.debug') }, slot: 'left', panelId: 'debug', keybinding: 'mod+shift+d' },
  { id: 'layout.toggleNotes', get title() { return t('layout.panel.notes') }, slot: 'right', panelId: 'notes', keybinding: 'mod+alt+n' },
  { id: 'layout.toggleSocial', get title() { return t('layout.panel.social') }, slot: 'right', panelId: 'social', keybinding: 'mod+shift+s' },
  { id: 'layout.toggleTabs', get title() { return t('layout.panel.tabs') }, slot: 'right', panelId: 'tabs', keybinding: 'mod+shift+t' },
  { id: 'layout.toggleProblems', get title() { return t('layout.panel.problems') }, slot: 'bottom', panelId: 'problems', keybinding: 'mod+shift+m' }
]

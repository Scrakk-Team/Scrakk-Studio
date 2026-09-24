// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Feature Settings — modal de ajustes genérico. Las secciones viven en
 * sections/ con su propio .tsx y se registran en sections/index.ts; aquí
 * solo se exporta el modal, el registry y el trigger global.
 */

import type { SettingsSectionId } from './sections'

export { SettingsModal } from './SettingsModal'
export {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  type SettingsSectionDef
} from './sections'

/** Abre el modal de Ajustes (evento global que App escucha), directo en una sección. */
export function openSettingsModal(section?: SettingsSectionId): void {
  window.dispatchEvent(new CustomEvent('open-settings', { detail: { section } }))
}

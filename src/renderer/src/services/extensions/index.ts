/**
 * Sistema de extensiones SEF — API pública.
 *
 * - `ExtensionRegistry`: store de contribuciones (paneles, botones de la
 *   activity bar, tabs centrales) que alimenta los sistemas de la app.
 * - `bootExtensions()`: carga las builtin (compiladas en el bundle) y las
 *   extensiones del usuario (`.sef` instaladas en userData).
 *
 * El registro es declarativo: cada extensión declara sus contribuciones en
 * su `manifest.json`; el loader las resuelve y las registra acá.
 */

export { ExtensionRegistry } from './registry'
export { bootExtensions } from './boot'
export { loadBuiltinExtensions } from './loader/builtin'
export { loadInstalledExtensions, registerInstalledExtension } from './loader/installed'
export {
  ExtensionTypeRegistry,
  ensureTypesRegistered
} from './types'
export type {
  ExtensionTypeHandler,
  ExtensionTypeContext,
  ParseContext
} from './types'
export type {
  ExtensionManifest,
  ExtensionContributions,
  PanelContribution,
  ActivityBarContribution,
  CenterTabContribution,
  RegisteredExtension,
  RegisteredCenterTab,
  ComponentResolver
} from './manifest'
export type {
  ThemeContribution,
  ThemeDefinition
} from './types/themes/schema'
export type { LspContribution } from './types/lsp/schema'
export type { RegisteredThemeEntry } from './types/themes/logic'
export {
  listThemes as listRegisteredThemes,
  activateTheme,
  deactivateTheme,
  getActiveThemeId,
  getTheme as getRegisteredTheme,
  subscribeToThemes
} from './types/themes/logic'
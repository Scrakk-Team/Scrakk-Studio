/**
 * Tipos de extensión — registro central.
 *
 * Cada carpeta bajo `types/<kind>/` es un tipo de contribución con la
 * estructura fija: api.ts (handler), logic.ts, schema.ts, store.ts.
 * Agregar un tipo nuevo = crear la carpeta + una línea en ensureTypesRegistered().
 */

import { ExtensionTypeRegistry } from './registry'
import { panelsHandler } from './panels/api'
import { activityBarHandler } from './activitybar/api'
import { centerTabsHandler } from './centertabs/api'
import { themesHandler } from './themes/api'
import { lspHandler } from './lsp/api'

let registered = false

/** Idempotente: registra todos los tipos conocidos en el TypeRegistry. */
export function ensureTypesRegistered(): void {
  if (registered) return
  registered = true
  ExtensionTypeRegistry.registerType(panelsHandler)
  ExtensionTypeRegistry.registerType(activityBarHandler)
  ExtensionTypeRegistry.registerType(centerTabsHandler)
  ExtensionTypeRegistry.registerType(themesHandler)
  ExtensionTypeRegistry.registerType(lspHandler)
}

export { ExtensionTypeRegistry } from './registry'
export type {
  ExtensionTypeHandler,
  ExtensionTypeContext,
  ParseContext,
  AnyExtensionTypeHandler
} from './handler'
export type { PanelContribution } from './panels/schema'
export type { ActivityBarContribution } from './activitybar/schema'
export type { CenterTabContribution } from './centertabs/schema'
export type { ThemeContribution, ThemeDefinition } from './themes/schema'
export type { LspContribution } from './lsp/schema'

/**
 * Tipos de extensión — registro central.
 *
 * Cada carpeta bajo `types/<kind>/` es un tipo de contribución con la
 * estructura fija: api.ts (handler), logic.ts, schema.ts, store.ts.
 * Agregar un tipo nuevo = crear la carpeta + una línea en ensureTypesRegistered().
 */

import { ExtensionTypeRegistry } from './registry'
import { panelsHandler } from './panels/api'
import { viewsHandler } from './views/api'
import { activityBarHandler } from './activitybar/api'
import { centerTabsHandler } from './centertabs/api'
import { themesHandler } from './themes/api'
import { languagesHandler } from './languages/api'
import { lspHandler } from './lsp/api'
import { notificationsHandler } from './notifications/api'
import { encodingsHandler } from './encodings/api'
import { fileIconsHandler } from './fileIcons/api'
import { productIconsHandler } from './productIcons/api'

let registered = false

/** Idempotente: registra todos los tipos conocidos en el TypeRegistry. */
export function ensureTypesRegistered(): void {
  if (registered) return
  registered = true
  ExtensionTypeRegistry.registerType(panelsHandler)
  ExtensionTypeRegistry.registerType(viewsHandler)
  ExtensionTypeRegistry.registerType(activityBarHandler)
  ExtensionTypeRegistry.registerType(centerTabsHandler)
  ExtensionTypeRegistry.registerType(themesHandler)
  ExtensionTypeRegistry.registerType(languagesHandler)
  ExtensionTypeRegistry.registerType(lspHandler)
  ExtensionTypeRegistry.registerType(notificationsHandler)
  ExtensionTypeRegistry.registerType(encodingsHandler)
  ExtensionTypeRegistry.registerType(fileIconsHandler)
  ExtensionTypeRegistry.registerType(productIconsHandler)
}

export { ExtensionTypeRegistry } from './registry'
export type {
  ExtensionTypeHandler,
  ExtensionTypeContext,
  ParseContext,
  AnyExtensionTypeHandler
} from './handler'
export type { PanelContribution } from './panels/schema'
export type { ViewContribution } from './views/schema'
export type { ActivityBarContribution } from './activitybar/schema'
export type { CenterTabContribution } from './centertabs/schema'
export type { ThemeContribution, ThemeDefinition } from './themes/schema'
export type {
  LanguageContribution,
  GrammarContribution,
  TreeSitterGrammar,
  TextMateGrammar,
  SnippetContribution,
  SemanticTokenScopeContribution,
  LanguageIcon,
  GrammarKind
} from './languages/schema'
export { LanguageRegistry } from './languages/logic'
export type {
  RegisteredLanguage,
  LanguageQueryData,
  LanguageCapabilities,
  LanguageConfiguration,
  Snippet
} from './languages/logic'
export {
  parseLanguageConfiguration,
  parseSnippets,
  resolveLanguageForPath,
  resolveLanguageByFirstLine,
  globToRegExp,
  loadQueryData
} from './languages/logic'
export {
  getLanguageOverride,
  persistLanguageOverride,
  hasNativeConsent,
  grantNativeConsent,
  revokeNativeConsent,
  listNativeConsents
} from './languages/store'
export type {
  LanguageOverride,
  LanguageSourceOverride,
  NativeGrammarConsent
} from './languages/store'
export type { LspContribution } from './lsp/schema'
export type { FileIconContribution } from './fileIcons/schema'
export type { ProductIconContribution } from './productIcons/schema'

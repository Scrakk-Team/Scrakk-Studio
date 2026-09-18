/**
 * Compatibility — índice compartido (main + renderer + tests).
 */

export type {
  CompatSource,
  CompatReport,
  MappedApi,
  VsixFileEntry,
  VsixPackageJson,
  TranslatedFileIconContribution,
  TranslatedThemeContribution,
  IconsTranslation,
  ConvertedExtension,
  UntranslatableError
} from './types'
export { extractVsix, resolveVsixFile, resolveThemeAsset, extensionIdOf, displayNameOf } from './vscode/extract'
export { analyzeVsix, analyzeDeclarative, analyzeCode, verifyCoverage } from './vscode/analyze'
export { validateVsixBuffer, validateVsixManifest, isSafeZipPath } from './vscode/validate'
export { detectKinds, describeKinds, KIND_TABLE } from './vscode/kinds'
export type { KindStatus, KindSupport } from './vscode/kinds'
export { parseJsonc } from './vscode/jsonc'
export {
  detectIconThemes,
  translateIconThemes,
  sanitizeThemeId
} from './vscode/translators/types/icons/icons'
export {
  detectColorThemes,
  translateColorThemes,
  slugify
} from './vscode/translators/types/themes/themes'
export {
  detectProductIconThemes,
  translateProductIconThemes,
  sanitizeProductId
} from './vscode/translators/types/product-icons/product-icons'
export { TRANSLATORS } from './vscode/translators/registry'
export {
  SURFACE,
  listSurfaceNamespaces,
  getSurfaceNamespace,
  allSurfaceEntries,
  findSurfaceEntry,
  validateSurface,
  coverageOf,
  coverageReport,
  describeCoverage,
  auditApi,
  missingFromApi
} from './surface'
export type {
  SurfaceEntry,
  SurfaceNamespace,
  SurfaceRoute,
  SurfaceStatus,
  NamespaceCoverage
} from './surface'
export { convertVsix, safeSefId, COMPAT_ENGINE_CONSTRAINT } from './vscode/pipeline'

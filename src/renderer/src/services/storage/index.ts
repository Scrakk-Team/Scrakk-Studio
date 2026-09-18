/**
 * API pública del servicio de almacenamiento persistente.
 *
 * Importar desde '@services/storage'.
 */

// Motor de bajo nivel (expuesto por si algún módulo necesita acceso directo).
export { lsGet, lsSet, lsRemove, lsClear } from './localStorage'

// Schema de tipos.
export type {
  LayoutSlotsData,
  PersistedLayoutData,
  PersistedLayoutV3Data,
  PersistedSplitTree,
  PersistedSlotData,
  PersistedTabData,
  LegacyLayoutSlotsData,
  EditorSessionData,
  StorageSchema,
  StorageKey,
  OnboardingStatus,
  TelemetryPreference,
} from './schema'
export { STORAGE_KEYS } from './schema'

// API de alto nivel (lo que usan los módulos de la app).
export {
  readLayoutSlotsRaw,
  writeLayoutSlotsRaw,
  getPersistedEditorOpenFiles,
  persistEditorOpenFiles,
  getPersistedEditorActivePath,
  persistEditorActivePath,
  getPersistedOnboardingStatus,
  persistOnboardingStatus,
  getPersistedOnboardingStep,
  persistOnboardingStep,
  getPersistedTelemetryEnabled,
  persistTelemetryEnabled,
  getPersistedTelemetryAskedAt,
  markTelemetryAsked,
  clearAllStorage,
} from './storageService'
export { getPersistedHighlightSource, persistHighlightSource } from './storageService'
export { getPersistedGrammarEngine, persistGrammarEngine } from './storageService'
export {
  getPersistedChatSessions,
  persistChatSessions,
  getPersistedChatActiveSession,
  persistChatActiveSession,
} from './storageService'
export type { EditorGrammarEngine, EditorHighlightSource } from './schema'

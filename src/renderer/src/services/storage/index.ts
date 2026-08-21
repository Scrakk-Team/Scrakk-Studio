/**
 * API pública del servicio de almacenamiento persistente.
 *
 * Importar desde '@services/storage'.
 */

// Motor de bajo nivel (expuesto por si algún módulo necesita acceso directo).
export { lsGet, lsSet, lsRemove, lsClear } from './localStorage'

// Schema de tipos.
export type { LayoutSlotsData, EditorSessionData, StorageSchema, StorageKey } from './schema'
export { STORAGE_KEYS } from './schema'

// API de alto nivel (lo que usan los módulos de la app).
export {
  getPersistedLayoutSlots,
  persistLayoutSlots,
  getPersistedEditorOpenFiles,
  persistEditorOpenFiles,
  getPersistedEditorActivePath,
  persistEditorActivePath,
  clearAllStorage,
} from './storageService'
export { getPersistedHighlightSource, persistHighlightSource } from './storageService'
export type { EditorHighlightSource } from './schema'

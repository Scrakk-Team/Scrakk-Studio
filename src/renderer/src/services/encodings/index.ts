/**
 * Servicios de codificaciones — API pública del módulo.
 */

export {
  readEncoded,
  writeEncoded,
  listEncodings,
  registerDynamicCodecs,
  removeDynamicCodecs
} from './api'
export {
  setDetected,
  setEncoding,
  getDocumentEncoding,
  forget,
  notifyEncodingListeners,
  subscribe,
  _resetForTests
} from './documentState'
export type { DocumentEncoding } from './documentState'

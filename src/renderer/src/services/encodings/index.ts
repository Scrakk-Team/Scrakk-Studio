// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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

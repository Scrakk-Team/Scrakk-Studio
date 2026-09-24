// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Textos custom del chat spawneado de un subagente. */
export interface SpawnTexts {
  /** Título del panel (default: label del agente). */
  title?: string
  /** Estado mientras trabaja. */
  working?: string
  /** Estado al terminar. */
  done?: string
  /** Estado ante error. */
  error?: string
  /** Placeholder del input bloqueado. */
  lockedText?: string
}

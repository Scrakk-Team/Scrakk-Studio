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

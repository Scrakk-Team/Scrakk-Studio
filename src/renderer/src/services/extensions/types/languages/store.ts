// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo `languages` — estado persistido.
 *
 * Dos cosas que el usuario tiene que poder decidir y que deben sobrevivir al
 * reinicio:
 *
 * 1. **Override de fuente por lenguaje**: con 4 fuentes (tree-sitter nativo,
 *    tree-sitter dinámico, TextMate, LSP) puede haber un lenguaje donde la
 *    gramática de la extensión sea peor que la del motor, o al revés. El
 *    usuario elige y se recuerda.
 * 2. **Consentimiento de gramáticas nativas**: un `.so`/`.dll` es código nativo.
 *    Cargarlo es una decisión explícita del usuario, y la decisión se guarda
 *    por parser (con su hash): si la extensión cambia el binario, se vuelve a
 *    preguntar.
 */

export type LanguageSourceOverride = 'auto' | 'treeSitter' | 'treeSitterDynamic' | 'textMate'

export interface LanguageOverride {
  source?: LanguageSourceOverride
  disabled?: boolean
}

const OVERRIDES_KEY = 'scrakk-studio:language-overrides'
const NATIVE_CONSENT_KEY = 'scrakk-studio:native-grammar-consent'

function readRecord<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, T>
  } catch {
    return {}
  }
}

function writeRecord<T>(key: string, value: Record<string, T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin almacenamiento: el override queda solo en memoria.
  }
}

export function loadLanguageOverrides(): Record<string, LanguageOverride> {
  return readRecord<LanguageOverride>(OVERRIDES_KEY)
}

export function getLanguageOverride(languageId: string): LanguageOverride {
  return loadLanguageOverrides()[languageId] ?? {}
}

export function persistLanguageOverride(languageId: string, override: LanguageOverride): void {
  const all = loadLanguageOverrides()
  const next: LanguageOverride = { ...all[languageId], ...override }
  // `auto` sin disabled es el default: no hace falta guardar nada.
  if ((next.source === undefined || next.source === 'auto') && !next.disabled) {
    delete all[languageId]
  } else {
    all[languageId] = next
  }
  writeRecord(OVERRIDES_KEY, all)
}

// ── Consentimiento de código nativo ────────────────────────────────────────

export interface NativeGrammarConsent {
  /** sha256 del binario al que el usuario dio permiso. */
  sha256?: string
  /** Parser (ruta dentro del paquete) consentido. */
  parser: string
  at: number
}

/**
 * ¿El usuario ya aceptó cargar este parser nativo?
 *
 * Se compara por hash cuando la extensión declara uno: si el binario cambia,
 * el consentimiento viejo NO vale (es la diferencia entre "confío en esta
 * extensión" y "confío en este archivo exacto").
 */
export function hasNativeConsent(parser: string, sha256?: string): boolean {
  const all = readRecord<NativeGrammarConsent>(NATIVE_CONSENT_KEY)
  const entry = all[parser]
  if (!entry) return false
  if (sha256 && entry.sha256 && entry.sha256 !== sha256) return false
  return true
}

export function grantNativeConsent(parser: string, sha256?: string): void {
  const all = readRecord<NativeGrammarConsent>(NATIVE_CONSENT_KEY)
  all[parser] = { parser, sha256, at: Date.now() }
  writeRecord(NATIVE_CONSENT_KEY, all)
}

export function revokeNativeConsent(parser: string): void {
  const all = readRecord<NativeGrammarConsent>(NATIVE_CONSENT_KEY)
  delete all[parser]
  writeRecord(NATIVE_CONSENT_KEY, all)
}

export function listNativeConsents(): NativeGrammarConsent[] {
  return Object.values(readRecord<NativeGrammarConsent>(NATIVE_CONSENT_KEY))
}

/**
 * StorageService — API de alto nivel para leer y escribir el estado persistente.
 *
 * Centraliza la lógica de defaults, validación básica y serialización.
 * Todos los accesos a localStorage desde la app deben pasar por aquí,
 * nunca directamente por lsGet/lsSet.
 */

import { lsGet, lsSet, lsRemove, lsClear } from './localStorage'
import { STORAGE_KEYS } from './schema'
import type { ChatSessionsData, OnboardingStatus } from './schema'
import type { EditorFileTab } from '@features/editor'
import type { EditorGrammarEngine, EditorHighlightSource } from './schema'

// ── Validadores ─────────────────────────────────────────────────────────────

function isValidEditorFiles(value: unknown): value is EditorFileTab[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as EditorFileTab).path === 'string' &&
      typeof (item as EditorFileTab).name === 'string'
  )
}

// ── Layout ──────────────────────────────────────────────────────────────────
// El layout v2 (multi-tab por slot) guarda su forma serializada; la migración
// del formato v1 (un panel por slot) y la validación viven en
// features/layout/persistence.ts. Acá solo se lee/escribe el JSON crudo.

export function readLayoutSlotsRaw(): unknown {
  return lsGet(STORAGE_KEYS.LAYOUT_SLOTS)
}

export function writeLayoutSlotsRaw(data: unknown): void {
  lsSet(STORAGE_KEYS.LAYOUT_SLOTS, data)
}

// ── Editor (open files + active path) ───────────────────────────────────────

export function getPersistedEditorOpenFiles(): EditorFileTab[] {
  const raw = lsGet<EditorFileTab[]>(STORAGE_KEYS.EDITOR_OPEN_FILES)
  return isValidEditorFiles(raw) ? raw : []
}

export function persistEditorOpenFiles(files: EditorFileTab[]): void {
  lsSet(STORAGE_KEYS.EDITOR_OPEN_FILES, files)
}

export function getPersistedEditorActivePath(): string | null {
  const raw = lsGet<string>(STORAGE_KEYS.EDITOR_ACTIVE_PATH)
  return typeof raw === 'string' ? raw : null
}

export function persistEditorActivePath(path: string | null): void {
  if (path === null) {
    lsRemove(STORAGE_KEYS.EDITOR_ACTIVE_PATH)
  } else {
    lsSet(STORAGE_KEYS.EDITOR_ACTIVE_PATH, path)
  }
}

// ── Utilidades globales ──────────────────────────────────────────────────────

/** Borra todo el estado persistido de la app. Útil en logout o reset. */

/** Fuente de resaltado del editor (treesitter | lsp | mixed). Default: treesitter. */
function isValidHighlightSource(value: unknown): value is EditorHighlightSource {
  return value === 'treesitter' || value === 'lsp' || value === 'mixed'
}

export function getPersistedHighlightSource(): EditorHighlightSource {
  try {
    const raw = lsGet(STORAGE_KEYS.EDITOR_HIGHLIGHT_SOURCE)
    const parsed: unknown = typeof raw === 'string' && raw.length > 0 ? JSON.parse(raw) : undefined
    if (isValidHighlightSource(parsed)) return parsed
  } catch {
    // caer al default
  }
  return 'treesitter'
}

export function persistHighlightSource(source: EditorHighlightSource): void {
  lsSet(STORAGE_KEYS.EDITOR_HIGHLIGHT_SOURCE, JSON.stringify(source))
}

// ── Motor de gramática (TextMate vs tree-sitter del paquete) ────────────────

/**
 * Qué motor de gramática prefiere el usuario cuando el lenguaje tiene los dos.
 *
 * El default `auto` reproduce el comportamiento histórico (TextMate gana) y es
 * el que menos sorprende: es el camino que siguen las extensiones de VS Code.
 * Un valor guardado desconocido cae acá en vez de romper el resaltado.
 */
function isValidGrammarEngine(value: unknown): value is EditorGrammarEngine {
  return value === 'auto' || value === 'treeSitter' || value === 'textMate'
}

export function getPersistedGrammarEngine(): EditorGrammarEngine {
  try {
    const raw = lsGet(STORAGE_KEYS.EDITOR_GRAMMAR_ENGINE)
    const parsed: unknown = typeof raw === 'string' && raw.length > 0 ? JSON.parse(raw) : undefined
    if (isValidGrammarEngine(parsed)) return parsed
  } catch {
    // caer al default
  }
  return 'auto'
}

export function persistGrammarEngine(engine: EditorGrammarEngine): void {
  lsSet(STORAGE_KEYS.EDITOR_GRAMMAR_ENGINE, JSON.stringify(engine))
}

// ── Chat (sesiones + activa) ────────────────────────────────────────────────

function isValidChatSessions(value: unknown): value is ChatSessionsData {
  if (!Array.isArray(value)) return false
  return value.every(
    (session) =>
      session &&
      typeof session === 'object' &&
      typeof (session as { id?: unknown }).id === 'string' &&
      typeof (session as { title?: unknown }).title === 'string' &&
      Array.isArray((session as { messages?: unknown }).messages) &&
      typeof (session as { createdAt?: unknown }).createdAt === 'number' &&
      typeof (session as { updatedAt?: unknown }).updatedAt === 'number'
  )
}

export function getPersistedChatSessions(): ChatSessionsData {
  const raw = lsGet<ChatSessionsData>(STORAGE_KEYS.CHAT_SESSIONS)
  return isValidChatSessions(raw) ? raw : []
}

export function persistChatSessions(sessions: ChatSessionsData): void {
  lsSet(STORAGE_KEYS.CHAT_SESSIONS, sessions)
}

export function getPersistedChatActiveSession(): string | null {
  const raw = lsGet<string>(STORAGE_KEYS.CHAT_ACTIVE_SESSION)
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export function persistChatActiveSession(sessionId: string | null): void {
  if (sessionId === null) {
    lsRemove(STORAGE_KEYS.CHAT_ACTIVE_SESSION)
  } else {
    lsSet(STORAGE_KEYS.CHAT_ACTIVE_SESSION, sessionId)
  }
}

// ── Configuración inicial (onboarding) ──────────────────────────────────────

export function getPersistedOnboardingStatus(): OnboardingStatus | null {
  const raw = lsGet<unknown>(STORAGE_KEYS.ONBOARDING_STATUS)
  return raw === 'running' || raw === 'done' ? raw : null
}

export function persistOnboardingStatus(status: OnboardingStatus): void {
  lsSet(STORAGE_KEYS.ONBOARDING_STATUS, status)
}

/** Paso guardado (0 si nunca se guardó o el valor es inválido). */
export function getPersistedOnboardingStep(): number {
  const raw = lsGet<unknown>(STORAGE_KEYS.ONBOARDING_STEP)
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return 0
  return raw
}

export function persistOnboardingStep(index: number): void {
  lsSet(STORAGE_KEYS.ONBOARDING_STEP, Math.max(0, Math.floor(index)))
}

// ── Telemetría (privacidad) ─────────────────────────────────────────────────

/** Default: APAGADA. Solo la enciende una elección explícita del usuario. */
export function getPersistedTelemetryEnabled(): boolean {
  return lsGet<unknown>(STORAGE_KEYS.TELEMETRY_ENABLED) === true
}

export function persistTelemetryEnabled(enabled: boolean): void {
  lsSet(STORAGE_KEYS.TELEMETRY_ENABLED, enabled)
}

/** Cuándo se preguntó por telemetría (null = nunca). Se pregunta UNA vez. */
export function getPersistedTelemetryAskedAt(): number | null {
  const raw = lsGet<unknown>(STORAGE_KEYS.TELEMETRY_ASKED_AT)
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

/** Marca que ya se preguntó (no se vuelve a preguntar en el wizard). */
export function markTelemetryAsked(at: number = Date.now()): void {
  lsSet(STORAGE_KEYS.TELEMETRY_ASKED_AT, at)
}

// ── Utilidades globales ──────────────────────────────────────────────────────

export function clearAllStorage(): void {
  lsClear()
}

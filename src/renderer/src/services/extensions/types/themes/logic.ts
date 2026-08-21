/**
 * Tipo 'themes' — lógica (runtime de temas).
 *
 * Registro de temas disponibles + aplicación:
 *  1. `colors` → overrides de CSS vars en un <style> dedicado (solo las vars
 *     definidas; el resto cae al tema base según `type` vía data-theme).
 *  2. `tokenColors` → localStorage 'scrakk-active-theme-tokens', que el
 *     puente de Innerta ya lee (innertaTheme.ts).
 *  3. Evento 'theme-changed' → titlebar overlay, Innerta y demás listeners.
 *
 * El applier NO toca la font del editor.
 */

import type { ThemeDefinition } from './schema'
import {
  loadStoredActive,
  saveStoredActive,
  clearStoredActive
} from './store'

export interface RegisteredThemeEntry {
  id: string
  name: string
  type: 'dark' | 'light'
  extensionId: string
  isBuiltin: boolean
  definition: ThemeDefinition
}

const STYLE_ID = 'sef-theme-overrides'
/** Key que consume el puente Innerta para los tokenColors. */
const TOKENS_KEY = 'scrakk-active-theme-tokens'

const themes = new Map<string, RegisteredThemeEntry>()
let activeId: string | null = null
let styleEl: HTMLStyleElement | null = null
let previousDataTheme: string | null = null

// ── Suscripción (UI reactiva sin polling) ──────────────────────────────────

type ThemesListener = () => void
const listeners = new Set<ThemesListener>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

/** Se suscribe a cambios del ecosistema de temas. Devuelve unsubscribe. */
export function subscribeToThemes(listener: ThemesListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ── Registro de temas disponibles ──────────────────────────────────────────

export function registerTheme(entry: RegisteredThemeEntry): void {
  themes.set(entry.id, entry)
  emit()
}

export function unregisterTheme(id: string): void {
  const wasActive = activeId === id
  themes.delete(id)
  if (wasActive) deactivate()
  emit()
}

export function getTheme(id: string): RegisteredThemeEntry | null {
  return themes.get(id) ?? null
}

export function listThemes(): RegisteredThemeEntry[] {
  return [...themes.values()]
}

export function getActiveThemeId(): string | null {
  return activeId
}

// ── Aplicación ─────────────────────────────────────────────────────────────

function ensureStyleEl(): HTMLStyleElement {
  if (styleEl) return styleEl
  styleEl = document.createElement('style')
  styleEl.id = STYLE_ID
  document.head.appendChild(styleEl)
  return styleEl
}

/** colors del theme → CSS vars. Solo overridea lo definido. */
function buildCssVars(def: ThemeDefinition): string {
  const c = def.colors
  const lines: string[] = []
  const push = (v: string | number | undefined, ...names: string[]): void => {
    if (v === undefined || v === null) return
    for (const name of names) lines.push(`  ${name}: ${v};`)
  }
  push(c.bg, '--color-bg')
  push(c.surface, '--color-surface')
  push(c.surfaceRaised, '--color-surface-raised')
  push(c.border, '--color-border')
  push(c.borderStrong, '--color-border-strong')
  push(c.accent, '--color-accent')
  push(c.accentHover, '--color-accent-hover')
  push(c.accentActive, '--color-accent-active')
  push(c.onAccent, '--color-on-accent')
  push(c.text, '--color-text')
  push(c.textSecondary, '--color-text-secondary')
  push(c.textMuted, '--color-text-muted')
  push(c.error, '--color-danger')
  push(c.errorHover, '--color-danger-hover')
  push(c.onError, '--color-on-danger')
  push(c.hover, '--color-hover')
  push(c.active, '--color-active')
  // Fondo del buffer del editor ≠ bg del chrome (dos vars por compat).
  push(c.editorBg, '--editor-bg', '--color-editor-bg')
  push(c.indentGuide, '--indent-guide-color')
  push(c.scrollbarThumb, '--color-scrollbar')
  return lines.join('\n')
}

/**
 * Activa un tema registrado. Idempotente por id.
 * Devuelve false si el id no existe.
 */
export function activateTheme(id: string): boolean {
  const entry = themes.get(id)
  if (!entry) return false

  const def = entry.definition

  // Tema base coherente para las vars que el theme no define.
  if (previousDataTheme === null) {
    previousDataTheme = document.documentElement.dataset.theme ?? null
  }
  document.documentElement.dataset.theme = def.type

  ensureStyleEl().textContent = `:root {\n${buildCssVars(def)}\n}`

  try {
    if (def.tokenColors && def.tokenColors.length > 0) {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(def.tokenColors))
    } else {
      localStorage.removeItem(TOKENS_KEY)
    }
  } catch {
    // Sin almacenamiento: los tokenColors no llegan a Innerta esta sesión.
  }

  activeId = id
  saveStoredActive({ id, extensionId: entry.extensionId })
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { themeId: id } }))
  emit()
  return true
}

/** Desactiva el tema activo y restaura el estado base de la app. */
export function deactivateTheme(): void {
  deactivate()
}

function deactivate(): void {
  if (styleEl) {
    styleEl.textContent = ''
  }
  if (previousDataTheme !== null) {
    document.documentElement.dataset.theme = previousDataTheme
    previousDataTheme = null
  } else {
    delete document.documentElement.dataset.theme
  }
  try {
    localStorage.removeItem(TOKENS_KEY)
  } catch {
    // no-op
  }
  activeId = null
  clearStoredActive()
  window.dispatchEvent(new CustomEvent('theme-changed'))
  emit()
}

/**
 * Al registrar un tema: si era el activo guardado de esa misma extensión,
 * se re-aplica (persistencia across reloads). Se llama desde el handler.
 */
export function reactivateIfStored(id: string, extensionId: string): void {
  const stored = loadStoredActive()
  if (stored && stored.id === id && stored.extensionId === extensionId) {
    activateTheme(id)
  }
}

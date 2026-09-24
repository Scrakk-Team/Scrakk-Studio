// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'themes' — lógica (runtime de temas).
 *
 * Registro de temas disponibles + aplicación:
 *  1. `colors` del tema activo SOBRE los del tema base de su tipo
 *     (scrakk-night / scrakk-day): los temas convertidos traen un subset de
 *     keys y el <style> se reemplaza entero — sin este merge, las vars no
 *     definidas quedarían transparentes (context menus, tabs activas…).
 *  2. `tokenColors` → localStorage 'scrakk-active-theme-tokens', que el
 *     puente de Innerta ya lee (innertaTheme.ts). Estos NO se fusionan.
 *  3. Evento 'theme-changed' → titlebar overlay, Innerta y demás listeners.
 *
 * El applier NO toca la font del editor.
 */

import type { ThemeBackground, ThemeColors, ThemeDefinition, ThemeFonts } from './schema'
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
/** Radio del glassmorphism automático (solo temas con imagen de fondo). */
const GLASS_BLUR_PX = 16
/** <link> de la fuente remota del tema activo. */
const FONT_LINK_ID = 'sef-theme-font'
/** Fallback si la custom no carga: sistema o la UI original del IDE. */
const FALLBACK_KEY = 'scrakk:font-fallback'

export type FontFallbackMode = 'system' | 'original'

function loadFallbackMode(): FontFallbackMode {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(FALLBACK_KEY) === 'original') {
      return 'original'
    }
  } catch {
    // Sin almacenamiento: sistema.
  }
  return 'system'
}

/** Stack del sistema (cuando la custom falla o mientras carga). */
const SYSTEM_STACK = `system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, sans-serif`

/** Respaldo elegido en Apariencia. Emite para re-render. */
export function getFontFallbackMode(): FontFallbackMode {
  return loadFallbackMode()
}

export function setFontFallbackMode(mode: FontFallbackMode): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FALLBACK_KEY, mode)
    }
  } catch {
    // Sin almacenamiento: solo memoria de sesión (se reaplica al activar).
  }
  const entry = activeId ? themes.get(activeId) : null
  if (entry) applyThemeFonts(entry.definition)
  emit()
}

/**
 * Stack `family, fallback` puro (testeable). La family ya viene saneada del
 * schema; el fallback lo elige el usuario en Apariencia.
 */
export function buildFontStack(family: string, fallback: FontFallbackMode): string {
  const quoted = family.includes(' ') && !family.startsWith('"') ? `"${family}"` : family
  return fallback === 'system' ? `${quoted}, ${SYSTEM_STACK}` : `${quoted}, var(--font-sans)`
}

/** Tema builtin al que se cae cuando no hay ninguno activo. */
export const DEFAULT_THEME_ID = 'scrakk-night'
/** Base light para fusionar temas parciales (ver resolveThemeColors). */
export const DEFAULT_LIGHT_THEME_ID = 'scrakk-day'

const themes = new Map<string, RegisteredThemeEntry>()
let activeId: string | null = null
let styleEl: HTMLStyleElement | null = null

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

/**
 * Colores efectivos de una definición: sus keys SOBRE las del tema base de
 * su tipo. Pura (testeable sin DOM): el applier la usa antes de emitir.
 * Si el base no está registrado, devuelve los colores tal cual.
 */
export function resolveThemeColors(def: ThemeDefinition): ThemeColors {
  const baseId = def.type === 'light' ? DEFAULT_LIGHT_THEME_ID : DEFAULT_THEME_ID
  const base = themes.get(baseId)
  if (!base || base.definition === def) return { ...def.colors }
  const merged: Record<string, string | number | ThemeBackground | undefined> = {
    ...base.definition.colors
  }
  for (const [key, value] of Object.entries(def.colors)) {
    if (value !== undefined && value !== null) merged[key] = value
  }
  return merged as ThemeColors
}

/**
 * Fonts efectivas: las del tema (la base casi nunca trae). Pura.
 */
export function resolveThemeFonts(def: ThemeDefinition): ThemeFonts | undefined {
  const baseId = def.type === 'light' ? DEFAULT_LIGHT_THEME_ID : DEFAULT_THEME_ID
  const base = themes.get(baseId)
  const baseFonts = base && base.definition !== def ? base.definition.fonts : undefined
  return def.fonts ?? baseFonts
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
  // Aviso e información: el theme.json YA los define (`warning`/`info`) pero no
  // se emitían, así que la UI caía a sus fallbacks hardcodeados (el panel de
  // Problemas, el chip de la barra y ahora el subrayado del editor). Un tema
  // que elige su ámbar tiene que verse en los tres lados.
  push(c.warning, '--color-warning')
  push(c.info, '--color-info')
  push(c.hover, '--color-hover')
  push(c.active, '--color-active')
  // Fondo del buffer del editor ≠ bg del chrome (dos vars por compat).
  push(c.editorBg, '--editor-bg', '--color-editor-bg')
  // Chrome por zona (titlebar/activitybar/statusbar): si el tema no las
  // define, el CSS cae a --color-surface (comportamiento histórico).
  push(c.titleBarBg, '--titlebar-bg')
  push(c.activityBarBg, '--activitybar-bg')
  push(c.statusBarBg, '--statusbar-bg')
  push(c.indentGuide, '--indent-guide-color')
  push(c.scrollbarThumb, '--color-scrollbar')
  push(c.scrollbarThumbHover, '--color-scrollbar-hover')
  // Temas flat (chrome monocromo): borde de las barras para que no se fundan
  // con el fondo. MISMA mezcla que los slots (color-mix 35%): pese idéntico,
  // ni más brillante ni más tenue.
  if (def.flat && c.panelBorder !== undefined) {
    push(`color-mix(in srgb, ${c.panelBorder} 35%, transparent)`, '--chrome-border')
  }
  // Borde de chrome (slots/paneles): si el tema lo define (propio o derivado
  // flat), las barras y slots lo usan en vez del color-mix del token base.
  if (c.panelBorder !== undefined) {
    push(c.panelBorder, '--panel-border-color')
    push(c.panelBorderOpacity ?? 100, '--panel-border-opacity')
  }
  // Fondo con imagen (capa detrás de todo el chrome). Solo si el objeto
  // sobrevivió al merge; la URL ya viene saneada del schema.
  if (c.background) {
    push(`url("${c.background.image}")`, '--theme-bg-image')
    push(c.background.imageOpacity ?? 1, '--theme-bg-opacity')
    push(c.background.imageSize ?? 'cover', '--theme-bg-size')
    push(c.background.imagePosition ?? 'center', '--theme-bg-position')
    push(c.background.imageBlur ?? '0px', '--theme-bg-blur')
    // Glassmorphism automático: las superficies translúcidas lo consumen
    // vía `backdrop-filter: var(--glass-blur, none)`. Sin imagen no se
    // emite → none → cero costo GPU y cero cambio visual.
    push(`blur(${GLASS_BLUR_PX}px) saturate(150%)`, '--glass-blur')
  }
  // Fuente UI del tema (v1: solo UI, no editor/terminal).
  const fonts = resolveThemeFonts(def)
  const ui = fonts?.ui
  if (ui) {
    push(buildFontStack(ui.family, loadFallbackMode()), '--theme-font-ui')
    push(ui.size, '--theme-font-ui-size')
    push(ui.weight, '--theme-font-ui-weight')
    push(ui.lineHeight, '--theme-font-ui-line-height')
  }
  return lines.join('\n')
}

/**
 * Gestiona el <link> de la fuente remota + verifica carga real.
 * Si falla (sin internet, URL caída) → noti ROJA del sistema y queda el
 * fallback. Solo corre en browser con document.fonts.
 */
function applyThemeFonts(def: ThemeDefinition): void {
  if (typeof document === 'undefined') return
  const prev = document.getElementById(FONT_LINK_ID)
  const ui = resolveThemeFonts(def)?.ui
  if (!ui?.source || !ui.source.startsWith('https://')) {
    prev?.remove()
    return
  }
  let el = prev as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.id = FONT_LINK_ID
    el.rel = 'stylesheet'
    document.head.appendChild(el)
  }
  const href = ui.source
  const family = ui.family
  const needsLoad = el.getAttribute('href') !== href
  el.setAttribute('href', href)
  if (!needsLoad) return
  verifyFontLoaded(family, href)
}

async function verifyFontLoaded(family: string, href: string): Promise<void> {
  const fail = (): void => {
    // Import dinámico para no acoplar themes→notifications en import-time.
    void import('@services/notifications').then(({ notify }) => {
      notify({
        title: `Fuente "${family}"`,
        message: 'No se pudo cargar (¿sin internet?). Usando respaldo.',
        severity: 'error'
      })
    })
  }
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (!fonts) return
    const spec = `16px "${family}"`
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
    await Promise.race([fonts.load(spec).catch(() => []), timeout])
    // Re-chequeo post-load: si el href cambió mientras tanto, es otro tema.
    const current = document.getElementById(FONT_LINK_ID)?.getAttribute('href')
    if (current !== href) return
    let covered = false
    try {
      covered = fonts.check(spec)
    } catch {
      covered = false
    }
    if (!covered) fail()
  } catch {
    fail()
  }
}

/**
 * Background con imagen del tema ACTIVO (resuelto sobre la base).
 * Null si el tema no trae imagen: la capa no se renderiza.
 */
export function getActiveThemeBackground(): ThemeBackground | null {
  const entry = activeId ? themes.get(activeId) : null
  if (!entry) return null
  return resolveThemeColors(entry.definition).background ?? null
}

/**
 * Activa un tema registrado. Idempotente por id.
 * Devuelve false si el id no existe.
 */
export function activateTheme(id: string): boolean {
  const entry = themes.get(id)
  if (!entry) return false

  const def = entry.definition

  // data-theme coherente con el tipo del tema (Innerta, titlebar, etc.).
  document.documentElement.dataset.theme = def.type

  ensureStyleEl().textContent = `:root {\n${buildCssVars({ ...def, colors: resolveThemeColors(def) })}\n}`
  applyThemeFonts(def)

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

/** Desactiva el tema activo y cae al tema por defecto builtin. */
export function deactivateTheme(): void {
  deactivate()
}

function deactivate(): void {
  // Sin themes.css hardcodeado, "sin tema" = app sin colores: siempre
  // debe quedar uno activo. Fallback al default builtin si existe.
  const fallback = themes.get(DEFAULT_THEME_ID)
  if (fallback && activeId !== DEFAULT_THEME_ID) {
    activateTheme(DEFAULT_THEME_ID)
    return
  }
  if (styleEl) {
    styleEl.textContent = ''
  }
  document.getElementById(FONT_LINK_ID)?.remove()
  delete document.documentElement.dataset.theme
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

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

import type {
  ThemeAnsi,
  ThemeBackground,
  ThemeColors,
  ThemeDefinition,
  ThemeFonts,
  ThemeRadius,
  ThemeRadiusMap
} from './schema'
import { THEME_ANSI_SLOTS, THEME_RADIUS_SLOTS, normalizeRadiusValue } from './schema'
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
/** Key que consume el puente Innerta para la paleta ANSI (terminal). */
const ANSI_KEY = 'scrakk-active-theme-ansi'
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
 * Paleta ANSI efectiva: la del tema SOBRE la del tema base de su tipo.
 *
 * Un tema claro convertido que no define `ansi` hereda la paleta clara de
 * `scrakk-day`; sin esto la terminal seguiría usando los blancos invisibles del
 * default del motor. Slot por slot, no se reemplaza el objeto entero.
 */
export function resolveThemeAnsi(def: ThemeDefinition): ThemeAnsi | undefined {
  const baseId = def.type === 'light' ? DEFAULT_LIGHT_THEME_ID : DEFAULT_THEME_ID
  const base = themes.get(baseId)
  const baseAnsi = base && base.definition !== def ? base.definition.ansi : undefined
  if (!def.ansi) return baseAnsi
  if (!baseAnsi) return def.ansi
  return { ...baseAnsi, ...def.ansi }
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

/**
 * Esquinas efectivas del tema. Igual que las fonts: si el tema no las define,
 * valen las de la base (que tampoco las trae → los radios del sistema).
 */
export function resolveThemeRadius(def: ThemeDefinition): ThemeRadius | undefined {
  const baseId = def.type === 'light' ? DEFAULT_LIGHT_THEME_ID : DEFAULT_THEME_ID
  const base = themes.get(baseId)
  const baseRadius = base && base.definition !== def ? base.definition.radius : undefined
  return def.radius ?? baseRadius
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
  // `success` estaba en el schema y NO se emitía: 11 lugares del CSS caían a
  // `var(--color-success, #3fb950)`, o sea un verde hardcodeado que ignora el
  // tema. Es el mismo caso que `warning`/`info`, que ya se arreglaron así.
  push(c.success, '--color-success')
  // Tintes del DIFF (fondo de línea del editor). El motor pinta exactamente el
  // color que le llega, sin paleta: estos tokens son el default que el store de
  // decoraciones lee, y llevan alfa porque el texto va encima.
  push(c.diffAdded, '--color-diff-added')
  push(c.diffRemoved, '--color-diff-removed')
  push(c.diffModified, '--color-diff-modified')
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
  // Fondo del tema (imagen u overlay) detrás de todo el chrome.
  if (c.background) {
    if (c.background.type === 'image') {
      push(`url("${c.background.image}")`, '--theme-bg-image')
      push(c.background.imageOpacity ?? 1, '--theme-bg-opacity')
      push(c.background.imageSize ?? 'cover', '--theme-bg-size')
      push(c.background.imagePosition ?? 'center', '--theme-bg-position')
      push(c.background.imageBlur ?? '0px', '--theme-bg-blur')
    }
    // Glassmorphism de las superficies translúcidas (`--glass-blur`). El tema
    // decide: false lo apaga, un número fija el blur, un objeto fija blur y
    // saturación; ausente mantiene el automático por compatibilidad.
    const glass = c.background.glass
    if (glass === false) {
      push('none', '--glass-blur')
    } else if (typeof glass === 'number') {
      push(`blur(${glass}px) saturate(150%)`, '--glass-blur')
    } else if (glass && typeof glass === 'object') {
      push(
        `blur(${glass.blur ?? GLASS_BLUR_PX}px) saturate(${glass.saturate ?? 150}%)`,
        '--glass-blur'
      )
    } else {
      push(`blur(${GLASS_BLUR_PX}px) saturate(150%)`, '--glass-blur')
    }
  }
  // Paleta ANSI como vars CSS: la terminal la recibe por el puente Innerta,
  // pero la UI (previews, leyendas, chips de color) pinta con las MISMAS vars,
  // así no hay dos paletas viviendo en paralelo.
  const ansi = resolveThemeAnsi(def)
  if (ansi) {
    for (const slot of THEME_ANSI_SLOTS) {
      const kebab = slot.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)
      push(ansi[slot], `--ansi-${kebab}`)
    }
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
  // Esquinas/radios del chrome. `'rect'` aplana todo menos la cápsula (que es
  // una FORMA — avatares, puntos del resize — no una esquina; se puede pedir
  // cuadrada a mano con el mapa). Sin esto, los paneles quedaban siempre con el
  // radio hardcodeado del layout.
  const radius = resolveThemeRadius(def)
  if (radius === 'rect') {
    for (const slot of THEME_RADIUS_SLOTS) {
      if (slot === 'capsule') continue
      push('0px', `--radius-${slot}`)
    }
  } else if (radius && radius !== 'round') {
    for (const slot of THEME_RADIUS_SLOTS) push(radius[slot], `--radius-${slot}`)
  }
  return lines.join('\n')
}

/** Formato de fuente por extensión (lo pide `format()` del @font-face). */
function fontFormat(url: string): string {
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.woff2')) return 'woff2'
  if (clean.endsWith('.woff')) return 'woff'
  if (clean.endsWith('.ttf')) return 'truetype'
  if (clean.endsWith('.otf')) return 'opentype'
  return ''
}

/** ¿El `source` es una HOJA DE ESTILOS (trae su propio @font-face)? */
function isStylesheetSource(url: string): boolean {
  return (
    url.includes('/css2?') ||
    url.includes('fonts.googleapis.com/css') ||
    url.split('?')[0].toLowerCase().endsWith('.css')
  )
}

/**
 * Gestiona la fuente remota del tema + verifica carga real.
 * Si falla (sin internet, URL caída) → noti ROJA del sistema y queda el
 * fallback. Solo corre en browser con document.fonts.
 *
 * `source` acepta DOS formas:
 *  1. una **hoja de estilos** (Google Fonts `/css2?…`, cualquier `.css`) → se
 *     enlaza con `<link rel="stylesheet">` y su `@font-face` hace el resto; o
 *  2. un **archivo de fuente** (`.woff2`/`.woff`/`.ttf`/`.otf` — lo que documenta
 *     la guía de temas) → se inyecta el `@font-face` acá mismo.
 *
 * Antes TODO se enlazaba como `<link rel=stylesheet>`, así que un `.woff2` se
 * intentaba parsear como CSS, fallaba y la tipografía nunca cambiaba.
 */
function applyThemeFonts(def: ThemeDefinition): void {
  if (typeof document === 'undefined') return
  const prev = document.getElementById(FONT_LINK_ID)
  const ui = resolveThemeFonts(def)?.ui
  if (!ui?.source || !ui.source.startsWith('https://')) {
    prev?.remove()
    return
  }
  const href = ui.source
  const family = ui.family
  const stylesheet = isStylesheetSource(href)
  const tag = stylesheet ? 'link' : 'style'
  // Misma fuente ya aplicada (mismo href y mismo tipo de nodo): no se toca.
  if (prev?.getAttribute('data-src') === href && prev.tagName.toLowerCase() === tag) return
  prev?.remove()

  if (stylesheet) {
    const link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    link.setAttribute('href', href)
    link.setAttribute('data-src', href)
    document.head.appendChild(link)
  } else {
    const style = document.createElement('style')
    style.id = FONT_LINK_ID
    style.setAttribute('data-src', href)
    const format = fontFormat(href)
    style.textContent =
      `@font-face{font-family:"${family}";src:url("${href}")` +
      `${format ? ` format("${format}")` : ''};font-display:swap;}`
    document.head.appendChild(style)
  }
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
    const current = document.getElementById(FONT_LINK_ID)?.getAttribute('data-src')
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
 * Override de RADIOS en runtime — API para extensiones.
 *
 * El tema los define en su JSON (`radius`); esto deja que una extensión los
 * cambie en vivo (p. ej. un panel con un botón "esquinas rectas"). Va inline en
 * `<html>`, así que gana sobre el tema activo; `clearRadiusOverride()` lo limpia
 * y vuelve a lo que diga el theme.json. Los valores se validan igual que en el
 * schema: una extensión no puede inyectar CSS arbitrario.
 */
export function setRadiusOverride(value: ThemeRadius): void {
  if (typeof document === 'undefined') return
  const style = document.documentElement.style
  clearRadiusOverride()
  if (value === 'round') return
  if (value === 'rect') {
    for (const slot of THEME_RADIUS_SLOTS) {
      if (slot === 'capsule') continue
      style.setProperty(`--radius-${slot}`, '0px')
    }
    return
  }
  for (const slot of THEME_RADIUS_SLOTS) {
    const v = normalizeRadiusValue((value as ThemeRadiusMap)[slot])
    if (v) style.setProperty(`--radius-${slot}`, v)
  }
}

/** Limpia el override inline: el tema activo vuelve a mandar. */
export function clearRadiusOverride(): void {
  if (typeof document === 'undefined') return
  for (const slot of THEME_RADIUS_SLOTS) {
    document.documentElement.style.removeProperty(`--radius-${slot}`)
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
 * Arma la transición de RADIOS (clase `theme-animate` en <html>).
 *
 * Se arma en el frame SIGUIENTE al primer tema aplicado: así el tema inicial no
 * se anima al arrancar (no hay morph desde los radios por defecto) y, en cambio,
 * cada cambio de tema posterior interpola el radio en vivo.
 */
let radiusTransitionsArmed = false

function armRadiusTransitions(): void {
  if (radiusTransitionsArmed || typeof document === 'undefined') return
  radiusTransitionsArmed = true
  const arm = (): void => {
    // Algunos entornos de test montan un DOM mínimo sin `classList`.
    const root = document.documentElement as HTMLElement | undefined
    root?.classList?.add('theme-animate')
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(arm)
  else arm()
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

  // Paleta ANSI resuelta (con herencia del base) para el puente de la terminal.
  try {
    const ansi = resolveThemeAnsi(def)
    if (ansi && Object.keys(ansi).length > 0) {
      localStorage.setItem(ANSI_KEY, JSON.stringify(ansi))
    } else {
      localStorage.removeItem(ANSI_KEY)
    }
  } catch {
    // Sin almacenamiento: la terminal queda con la paleta del motor.
  }

  activeId = id
  saveStoredActive({ id, extensionId: entry.extensionId })
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { themeId: id } }))
  armRadiusTransitions()
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
    localStorage.removeItem(ANSI_KEY)
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

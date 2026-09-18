/**
 * ProductIcons — registry singleton con subscribe.
 *
 * Mismo patrón que fileIcons/modals: Map + Set<Listener> + emit().
 * Resolución de un id:
 *   1. Tema activo de extensión con glyph exacto (case-insensitive) → font.
 *   2. Set builtin `scrakk` (componente ProIcons).
 *   3. null → el componente usa el fallback (BoxIcon).
 *
 * Las fuentes de los temas se inyectan como @font-face dedicado (una sola
 * etiqueta <style>, reemplazada al cambiar de tema).
 */

import type { ProductIconTheme, RegisteredProductIconTheme, ResolvedProductIcon } from './types'
import { SCRAKK_PRODUCT_ICON_THEME_ID, builtinComponentFor, BUILTIN_PRODUCT_ICONS } from './builtin'
import {
  loadStoredActiveProductTheme,
  saveStoredActiveProductTheme,
  clearStoredActiveProductTheme
} from './store'

type Listener = () => void

const themes = new Map<string, RegisteredProductIconTheme>()
let activeId: string | null = null
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

export function subscribeToProductIcons(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ── Registro ───────────────────────────────────────────────────────────────

export function registerProductIconTheme(entry: RegisteredProductIconTheme): void {
  themes.set(entry.id, entry)
  purgeDefIndex(entry.id)
  if (activeId === null) {
    const stored = loadStoredActiveProductTheme()
    if (stored && (stored.id === SCRAKK_PRODUCT_ICON_THEME_ID || themes.has(stored.id))) {
      activeId = stored.id
    } else {
      activeId = SCRAKK_PRODUCT_ICON_THEME_ID
    }
  }
  if (activeId === entry.id) injectFontFaces(entry.theme)
  emit()
}

export function unregisterProductIconTheme(id: string): void {
  const wasActive = activeId === id
  themes.delete(id)
  purgeDefIndex(id)
  if (wasActive) {
    activeId = SCRAKK_PRODUCT_ICON_THEME_ID
    saveStoredActiveProductTheme({ id: SCRAKK_PRODUCT_ICON_THEME_ID })
    injectFontFaces(null)
  }
  emit()
}

export function getProductIconTheme(id: string): RegisteredProductIconTheme | null {
  return themes.get(id) ?? null
}

export function listProductIconThemes(): RegisteredProductIconTheme[] {
  return [...themes.values()]
}

export function getActiveProductIconThemeId(): string {
  return activeId ?? SCRAKK_PRODUCT_ICON_THEME_ID
}

export function getActiveProductIconTheme(): RegisteredProductIconTheme | null {
  const id = getActiveProductIconThemeId()
  if (id === SCRAKK_PRODUCT_ICON_THEME_ID) return null
  return themes.get(id) ?? null
}

/** Activa un tema (o 'scrakk'). Devuelve false si el id no existe. */
export function setActiveProductIconTheme(id: string): boolean {
  if (id !== SCRAKK_PRODUCT_ICON_THEME_ID && !themes.has(id)) return false
  activeId = id
  saveStoredActiveProductTheme({ id })
  injectFontFaces(id === SCRAKK_PRODUCT_ICON_THEME_ID ? null : (themes.get(id)?.theme ?? null))
  emit()
  return true
}

/** Si era el activo guardado, re-aplicarlo (across reloads). */
export function reactivateStoredProductIconTheme(id: string): void {
  const stored = loadStoredActiveProductTheme()
  if (stored && stored.id === id && themes.has(id)) {
    activeId = id
    injectFontFaces(themes.get(id)?.theme ?? null)
    emit()
  }
}

// ── @font-face ─────────────────────────────────────────────────────────────

const STYLE_ID = 'scrakk-product-icon-fonts'

function injectFontFaces(theme: ProductIconTheme | null): void {
  if (typeof document === 'undefined') return
  const prev = document.getElementById(STYLE_ID)
  if (!theme || theme.fonts.length === 0) {
    prev?.remove()
    return
  }
  let el = prev as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = theme.fonts
    .map(
      (f) => `@font-face {
  font-family: '${f.family}';
  src: url('${f.dataUri}') format('${f.format}');
  font-weight: ${f.weight || 'normal'};
  font-style: ${f.style || 'normal'};
  font-display: block;
}`
    )
    .join('\n')
}

// ── Resolución ─────────────────────────────────────────────────────────────

/**
 * Convierte fontCharacter VS Code a char. Formatos reales:
 * "\\EB42", "\\uEB42", "0xEB42", "EB42" (hex pelado, varios temas),
 * o el char literal (JSON "\uea6d" ya decodificado).
 * Devuelve null si no es parseable (el resolvedor usa fallback, no tofu).
 */
export function parseFontCharacter(raw: string): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (s.length === 1 || (s.length === 2 && (s.codePointAt(0) ?? 0) > 0xffff)) {
    return s
  }
  const patterns = [
    /^(?:\\u|\\U|U\+)([0-9a-fA-F]{2,6})$/,
    /^\\+([0-9a-fA-F]{2,6})$/,
    /^0x([0-9a-fA-F]+)$/i,
    /^([0-9a-fA-F]{3,6})$/
  ]
  for (const re of patterns) {
    const m = re.exec(s)
    if (m) {
      try {
        return String.fromCodePoint(parseInt(m[1], 16))
      } catch {
        return null
      }
    }
  }
  return null
}

/**
 * Índice id normalizado → id real del tema. Cubre exacto, lowercase y el
 * prefijo `codicon-` en ambas direcciones (algunos temas lo usan, otros no).
 */
const defIndexCache = new Map<string, Map<string, string>>()

function defIndexFor(theme: ProductIconTheme): Map<string, string> {
  const cached = defIndexCache.get(theme.id)
  if (cached) return cached
  const idx = new Map<string, string>()
  for (const id of Object.keys(theme.iconDefinitions)) {
    if (!theme.iconDefinitions[id]?.fontCharacter) continue
    idx.set(id, id)
    idx.set(id.toLowerCase(), id)
    const low = id.toLowerCase()
    if (low.startsWith('codicon-')) {
      const bare = low.slice('codicon-'.length)
      if (!idx.has(bare)) idx.set(bare, id)
    } else {
      const prefixed = `codicon-${low}`
      if (!idx.has(prefixed)) idx.set(prefixed, id)
    }
  }
  // Cache acotada (los temas no cambian; las desinstalaciones la purgan).
  if (defIndexCache.size > 32) defIndexCache.clear()
  defIndexCache.set(theme.id, idx)
  return idx
}

export function purgeDefIndex(id: string): void {
  defIndexCache.delete(id)
}

function themeGlyph(
  theme: ProductIconTheme,
  normalizedId: string
): { char: string; family: string } | null {
  const index = defIndexFor(theme)
  // 1) Id exacto (incluye variantes case/codicon- del índice).
  const direct = lookupGlyph(theme, index.get(normalizedId))
  if (direct) return direct
  // 2) Alias semánticos: ids propios de la app sin codicon equivalente
  //    ('chat' no existe en codicons; los temas traen comment-discussion).
  for (const alias of THEME_ID_ALIASES[normalizedId] ?? []) {
    const hit = lookupGlyph(theme, index.get(alias))
    if (hit) return hit
  }
  return null
}

/**
 * App id → codicons reales a probar en el tema (en orden). Solo se usa
 * cuando el id exacto no está definido; el builtin no cambia.
 */
const THEME_ID_ALIASES: Record<string, string[]> = {
  chat: ['comment-discussion', 'comment']
}

function lookupGlyph(
  theme: ProductIconTheme,
  key: string | undefined
): { char: string; family: string } | null {
  if (!key) return null
  const def = theme.iconDefinitions[key]
  if (!def?.fontCharacter) return null
  const char = parseFontCharacter(def.fontCharacter)
  if (!char) return null
  let family = theme.fonts[0]?.family
  if (def.fontId) {
    const f = theme.fonts.find((x) => x.id === def.fontId)
    if (f) family = f.family
  }
  if (!family) return null
  return { char, family }
}

/**
 * Resuelve un id de icono UI.
 * - Glyph del tema activo si lo define (override de extensiones).
 * - Componente builtin en caso contrario.
 * - null si el id es totalmente desconocido (el componente usa fallback).
 */
export function resolveProductIcon(id: string): ResolvedProductIcon | null {
  const normalized = String(id || '').trim().toLowerCase()
  if (!normalized) return null

  const active = getActiveProductIconTheme()
  if (active) {
    const glyph = themeGlyph(active.theme, normalized)
    if (glyph) return { kind: 'font', char: glyph.char, family: glyph.family }
  }

  if (builtinComponentFor(normalized)) {
    const entry = BUILTIN_PRODUCT_ICONS.find(
      (e) => e.id === normalized || e.synonyms?.includes(normalized)
    )
    return { kind: 'component', componentId: entry?.id ?? normalized }
  }
  return null
}

/** ¿El tema activo define este id? (para UI de gestión). */
export function themeHasProductIconId(id: string): boolean {
  const active = getActiveProductIconTheme()
  if (!active) return false
  const normalized = String(id || '').trim().toLowerCase()
  return themeGlyph(active.theme, normalized) !== null
}

export { clearStoredActiveProductTheme }

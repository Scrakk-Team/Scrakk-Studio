/**
 * Tipo 'themes' — schema declarativo.
 *
 * Dos capas de validación:
 *  1. El slice `contributes.themes` del manifest (qué temas aporta el paquete).
 *  2. El JSON del tema en sí (`normalizeThemeDefinition`) — formato SEF theme:
 *     { name, type: dark|light, colors: {...}, components?, tokenColors? }.
 *
 * Los colores faltantes NO se completan con defaults duros: el applier solo
 * overridea las vars definidas y el resto cae al tema base de la app
 * (coherente por `type`).
 */

import type { ParseContext } from '../handler'

// ── Slice del manifest ─────────────────────────────────────────────────────

export interface ThemeContribution {
  /** Id único del tema (global entre todas las extensiones). */
  id: string
  /** Nombre visible en el picker. */
  name: string
  type: 'dark' | 'light'
  /** Ruta del JSON del tema relativa a la raíz del paquete. */
  path: string
}

export function parseThemeContributions(
  raw: unknown,
  _ctx: ParseContext
): ThemeContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: ThemeContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<ThemeContribution>
    if (
      typeof c.id !== 'string' ||
      typeof c.name !== 'string' ||
      typeof c.path !== 'string' ||
      (c.type !== 'dark' && c.type !== 'light')
    ) {
      console.warn('[extensions/themes] contribución inválida descartada:', c)
      continue
    }
    out.push({ id: c.id, name: c.name, type: c.type, path: c.path })
  }
  return out
}

// ── Definición del tema (el JSON del archivo) ──────────────────────────────

export interface ThemeColors {
  bg?: string
  surface?: string
  surfaceRaised?: string
  border?: string
  borderStrong?: string
  accent?: string
  accentHover?: string
  accentActive?: string
  onAccent?: string
  text?: string
  textSecondary?: string
  textMuted?: string
  error?: string
  errorHover?: string
  onError?: string
  warning?: string
  success?: string
  info?: string
  hover?: string
  active?: string
  scrollbarThumb?: string
  scrollbarThumbHover?: string
  indentGuide?: string
  panelBorder?: string
  /** Opacidad del borde de paneles, 0–100. */
  panelBorderOpacity?: number
  /** Fondo del buffer del editor (≠ bg del chrome). */
  editorBg?: string
}

/** TokenColor estilo TextMate (VS Code). */
export interface ThemeToken {
  scope: string | string[]
  foreground?: string
  fontStyle?: string
}

export interface ThemeDefinition {
  name: string
  type: 'dark' | 'light'
  colors: ThemeColors
  components?: Record<string, unknown>
  tokenColors?: ThemeToken[]
}

/** #hex | rgb()/rgba() — los estados (hover/active) usan alpha. */
function isCssColor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true
  return /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)$/i.test(s)
}

/**
 * Valida y normaliza el JSON crudo de un tema. Tolerante: descarta campos
 * inválidos y conserva los válidos (temas parciales son legítimos).
 */
export function normalizeThemeDefinition(raw: unknown): ThemeDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const name = typeof r.name === 'string' ? r.name : ''
  const type = r.type === 'light' ? 'light' : r.type === 'dark' ? 'dark' : null
  if (!name || !type) {
    console.warn('[extensions/themes] JSON de tema sin name/type válido')
    return null
  }

  const colors: ThemeColors = {}
  if (r.colors && typeof r.colors === 'object') {
    const rc = r.colors as Record<string, unknown>
    for (const key of Object.keys(rc) as Array<keyof ThemeColors>) {
      const value = rc[key]
      if (value === undefined || value === null) continue
      // panelBorderOpacity y futuros parámetros numéricos.
      if (typeof value === 'number' && Number.isFinite(value)) {
        ;(colors as Record<string, unknown>)[key] = value
      } else if (isCssColor(value)) {
        ;(colors as Record<string, unknown>)[key] = value.trim()
      } else {
        console.warn(`[extensions/themes] color inválido para "${key}":`, value)
      }
    }
  }

  let tokenColors: ThemeToken[] | undefined
  if (Array.isArray(r.tokenColors)) {
    tokenColors = []
    for (const item of r.tokenColors) {
      if (!item || typeof item !== 'object') continue
      const t = item as Partial<ThemeToken>
      if (typeof t.foreground !== 'string' || !t.scope) continue
      tokenColors.push({
        scope: t.scope,
        foreground: t.foreground,
        fontStyle: typeof t.fontStyle === 'string' ? t.fontStyle : undefined
      })
    }
  }

  return {
    name,
    type,
    colors,
    components:
      r.components && typeof r.components === 'object'
        ? (r.components as Record<string, unknown>)
        : undefined,
    tokenColors
  }
}

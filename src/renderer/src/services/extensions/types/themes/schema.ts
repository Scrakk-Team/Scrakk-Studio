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
  /** Fondo con imagen (capa detrás de todo el chrome). Objeto validado. */
  background?: ThemeBackground
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
  /** Fondo de la titlebar (default: surface). */
  titleBarBg?: string
  /** Fondo de las activity bars (default: surface). */
  activityBarBg?: string
  /** Fondo de la statusbar (default: surface). */
  statusBarBg?: string
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
  /** True = chrome de un solo color (temas flat): las barras le ponen borde. */
  flat?: boolean
  /** Fuentes custom (v1: solo slot ui). */
  fonts?: ThemeFonts
}

/** Un slot de fuente (ui del theme). */
export interface ThemeFontSlot {
  family: string
  /** https: o data: (style-src/font-src del CSP mandan). */
  source?: string
  size?: string
  weight?: string
  lineHeight?: string
}

export interface ThemeFonts {
  ui?: ThemeFontSlot
}

/** Fondo con imagen del tema (eye-dark): capa detrás de todo el chrome. */
export interface ThemeBackground {
  type: 'image'
  /** https: o data: (≤4096 chars, sin `"`, `)` ni `\` para url("…") seguro). */
  image: string
  /** Opacidad 0–1. Default 1. */
  imageOpacity?: number
  /** Default 'cover'. */
  imageSize?: 'cover' | 'contain' | 'auto'
  /** Tokens seguros (nada de url()/expression). Default 'center'. */
  imagePosition?: string
  /** '12px', clamp 0–40. Default '0px'. */
  imageBlur?: string
}

/** #hex | rgb()/rgba() | transparent — los estados usan alpha. */
function isCssColor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (s.toLowerCase() === 'transparent') return true
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true
  return /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)$/i.test(s)
}

const BG_POSITIONS = new Set([
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top left',
  'top center',
  'top right',
  'center left',
  'center center',
  'center right',
  'bottom left',
  'bottom center',
  'bottom right',
  'left top',
  'left center',
  'left bottom',
  'right top',
  'right center',
  'right bottom'
])

/**
 * Valida el objeto `background` de un tema. Tolerante como el resto:
 * objeto malformado → null (warn) y el tema sigue sin imagen.
 */
export function normalizeThemeBackground(raw: unknown): ThemeBackground | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.type !== 'image') {
    console.warn('[extensions/themes] background solo soporta {type:"image"}:', r.type)
    return null
  }
  if (
    typeof r.image !== 'string' ||
    r.image.length === 0 ||
    r.image.length > 4096 ||
    (!r.image.startsWith('https://') && !r.image.startsWith('data:')) ||
    /["\\\\)\s]/.test(r.image)
  ) {
    console.warn('[extensions/themes] background.image inválida (https:/data: sin comillas ni espacios)')
    return null
  }
  const out: ThemeBackground = { type: 'image', image: r.image }
  if (typeof r.imageOpacity === 'number' && Number.isFinite(r.imageOpacity)) {
    out.imageOpacity = Math.max(0, Math.min(1, r.imageOpacity))
  }
  if (r.imageSize === 'cover' || r.imageSize === 'contain' || r.imageSize === 'auto') {
    out.imageSize = r.imageSize
  }
  if (typeof r.imagePosition === 'string') {
    const pos = r.imagePosition.trim().toLowerCase().replace(/\s+/g, ' ')
    if (
      BG_POSITIONS.has(pos) ||
      /^\d{1,3}%(\s+\d{1,3}%)?$/.test(pos)
    ) {
      out.imagePosition = pos
    } else {
      console.warn('[extensions/themes] background.imagePosition inválida, se ignora:', r.imagePosition)
    }
  }
  if (typeof r.imageBlur === 'string') {
    const match = r.imageBlur.trim().match(/^(\d+(?:\.\d+)?)px$/)
    if (match) {
      out.imageBlur = `${Math.max(0, Math.min(40, parseFloat(match[1])))}px`
    } else {
      console.warn('[extensions/themes] background.imageBlur inválida, se ignora:', r.imageBlur)
    }
  }
  return out
}

/**
 * Valida un slot de fuente. La family se inyecta en CSS: allowlist estricta
 * (letras/números/espacios/comas/guiones/comillas), sin url()/;/{}.
 */
export function normalizeThemeFontSlot(raw: unknown): ThemeFontSlot | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.family !== 'string') return null
  const family = r.family.trim().replace(/\s+/g, ' ')
  if (!family || family.length > 120 || !/^[\w\s,'"-]+$/.test(family)) {
    console.warn('[extensions/themes] fonts: family inválida, se descarta:', r.family)
    return null
  }
  const slot: ThemeFontSlot = { family }
  if (typeof r.source === 'string' && r.source) {
    const src = r.source.trim()
    if (
      src.length <= 4096 &&
      (src.startsWith('https://') || src.startsWith('data:')) &&
      !/["\\\s]/.test(src)
    ) {
      slot.source = src
    } else {
      console.warn('[extensions/themes] fonts: source inválida (solo https:/data:), se ignora')
    }
  }
  if (typeof r.size === 'string' && /^\d+(\.\d+)?px$/.test(r.size.trim())) {
    const px = parseFloat(r.size)
    if (px >= 10 && px <= 24) slot.size = `${px}px`
  }
  if (typeof r.weight === 'string' && /^(normal|bold|[1-9]00)$/.test(r.weight.trim())) {
    slot.weight = r.weight.trim()
  }
  if (typeof r.lineHeight === 'string' && /^\d+(\.\d+)?(px)?$/.test(r.lineHeight.trim())) {
    slot.lineHeight = r.lineHeight.trim()
  }
  return slot
}

/** Valida el bloque `fonts` (v1: solo slot ui). */
export function normalizeThemeFonts(raw: unknown): ThemeFonts | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const ui = normalizeThemeFontSlot((raw as Record<string, unknown>).ui)
  if (!ui) return undefined
  return { ui }
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
    // background es objeto validado aparte (imagen), no color.
    if (rc.background !== undefined && rc.background !== null) {
      const bg = normalizeThemeBackground(rc.background)
      if (bg) colors.background = bg
    }
    for (const key of Object.keys(rc) as Array<keyof ThemeColors>) {
      if (key === 'background') continue
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
    tokenColors,
    flat: r.flat === true ? true : undefined,
    fonts: normalizeThemeFonts(r.fonts)
  }
}

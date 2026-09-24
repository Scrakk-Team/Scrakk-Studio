// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Traductor themes: vsix color themes → SEF themes.
 * Vive en translators/types/themes/ con la misma libertad que icons/.
 *
 * Entrada: contributes.themes del package.json + bytes del .vsix.
 * Salida: contribuciones SEF {id, name, type, path: themes/<id>.json} +
 * assets (ThemeDefinition SEF: {name, type, colors, tokenColors}).
 *
 * Puertos fieles de scrakk (simplificados a nuestro ThemeColors):
 * - JSONC (comentarios + trailing commas).
 * - Cadena `include` recursiva (máx 8, anti-ciclos): el hijo overridea.
 * - `type` ← uiTheme, luego raw.type, luego luminancia de editor.background.
 * - Colores con alpha → se usa la parte sólida (nuestro schema valida CSS).
 * - tokenColors VS Code {scope, settings:{foreground,fontStyle}} → SEF.
 */

import type { MappedApi, VsixFileEntry, VsixPackageJson } from '../../../../types'
import { decodeText, resolveVsixFile } from '../../../extract'
import { parseJsonc } from '../../../jsonc'

export interface ThemesTranslation {
  contributions: Array<{ id: string; name: string; type: 'dark' | 'light'; path: string }>
  assets: Map<string, string>
  mapped: MappedApi[]
}

export function detectColorThemes(manifest: VsixPackageJson): boolean {
  const list = manifest.contributes?.themes
  return Array.isArray(list) && list.length > 0
}

export function slugify(s: string): string {
  return (
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'theme'
  )
}

function themeDirOf(themePath: string): string {
  const p = themePath.replace(/^\.\//, '').replace(/\\/g, '/')
  return p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : ''
}

function joinThemePath(themePath: string, rel: string): string {
  const clean = rel.replace(/^\.\//, '').replace(/\\/g, '/')
  if (clean.startsWith('/')) return clean.slice(1)
  if (!rel.startsWith('.') && clean.includes('/')) return clean
  return themeDirOf(themePath) + clean
}

/** Carga un theme JSON/JSONC resolviendo `include` (hijo overridea al padre). */
function loadThemeJsonResolved(
  themePath: string,
  files: VsixFileEntry[],
  depth = 0,
  seen: Set<string> = new Set()
): Record<string, unknown> | null {
  if (depth > 8) return null
  const key = themePath.replace(/^\.\//, '').replace(/\\/g, '/')
  if (seen.has(key)) return null
  seen.add(key)

  const file = resolveVsixFile(themePath, files)
  if (!file) return null
  let raw: Record<string, unknown>
  try {
    raw = parseJsonc(decodeText(file.data)) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null

  const include = typeof raw.include === 'string' ? raw.include.trim() : ''
  if (include) {
    const base = loadThemeJsonResolved(joinThemePath(themePath, include), files, depth + 1, seen)
    if (base) {
      const baseColors = (base.colors || {}) as Record<string, unknown>
      const childColors = (raw.colors || {}) as Record<string, unknown>
      const baseTokens = Array.isArray(base.tokenColors) ? base.tokenColors : []
      const childTokens = Array.isArray(raw.tokenColors) ? raw.tokenColors : []
      return {
        ...base,
        ...raw,
        colors: { ...baseColors, ...childColors },
        tokenColors: childTokens.length > 0 ? [...baseTokens, ...childTokens] : baseTokens
      }
    }
  }
  return raw
}

function hasThemeBody(raw: Record<string, unknown>): boolean {
  const colors = raw.colors
  if (colors && typeof colors === 'object' && Object.keys(colors).length > 0) return true
  if (Array.isArray(raw.tokenColors) && raw.tokenColors.length > 0) return true
  return false
}

function pick(colors: Record<string, string | undefined>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = colors[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

/** Parte sólida de un color (nuestro schema valida #hex/rgb; el alpha va a panelBorderOpacity). */
function solidOf(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  const m8 = /^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/.exec(s)
  if (m8) return `#${m8[1].toLowerCase()}`
  const m4 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])[0-9a-fA-F]$/.exec(s)
  if (m4) return `#${m4[1]}${m4[1]}${m4[2]}${m4[2]}${m4[3]}${m4[3]}`.toLowerCase()
  return s
}

/** Opacidad 0–100 del alpha embebido (solo hex con alpha; resto = 100). */
function opacityOf(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  const m = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})$/.exec(s)
  if (m) return Math.round((parseInt(m[1], 16) / 255) * 100)
  const m4 = /^#[0-9a-fA-F]{3}([0-9a-fA-F])$/.exec(s)
  if (m4) return Math.round((parseInt(m4[1] + m4[1], 16) / 255) * 100)
  return undefined
}

/** Luminancia 0–1 de un #hex (para inferir dark/light). Null si no parseable. */
function luminance(hex: string | undefined): number | null {
  if (!hex) return null
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const r = parseInt(m[1].slice(0, 2), 16) / 255
  const g = parseInt(m[1].slice(2, 4), 16) / 255
  const b = parseInt(m[1].slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function inferType(
  uiTheme: string | undefined,
  rawType: unknown,
  editorBg: string | undefined
): 'dark' | 'light' {
  if (uiTheme === 'vs' || uiTheme === 'hc-light') return 'light'
  if (uiTheme === 'vs-dark' || uiTheme === 'hc-black') return 'dark'
  const rt = String(rawType || '').toLowerCase()
  if (rt === 'light') return 'light'
  if (rt === 'dark') return 'dark'
  const lum = luminance(solidOf(editorBg))
  if (lum !== null) return lum > 0.5 ? 'light' : 'dark'
  return 'dark'
}

interface SefThemeColors {
  bg?: string
  surface?: string
  surfaceRaised?: string
  border?: string
  accent?: string
  text?: string
  textSecondary?: string
  textMuted?: string
  error?: string
  warning?: string
  success?: string
  info?: string
  scrollbarThumb?: string
  indentGuide?: string
  panelBorder?: string
  panelBorderOpacity?: number
  editorBg?: string
  titleBarBg?: string
  activityBarBg?: string
  statusBarBg?: string
  hover?: string
  active?: string
}

/**
 * Workbench por defecto de VS Code (Dark+ / Light+) — lo que VS Code pinta
 * cuando el tema NO define esos colores. El chrome NUNCA debe aplanarse a
 * editor.background: un tema mínimo queda con chrome default, no monocromo.
 */
const VSCODE_DEFAULT_WORKBENCH = {
  dark: {
    sideBarBackground: '#252526',
    titleBarBackground: '#3c3c3c',
    activityBarBackground: '#333333',
    statusBarBackground: '#007acc'
  },
  light: {
    sideBarBackground: '#f3f3f3',
    titleBarBackground: '#dddddd',
    activityBarBackground: '#2c2c2c',
    statusBarBackground: '#007acc'
  }
} as const

/**
 * Detecta un tema FLAT: el chrome entero comparte un mismo color (o no
 * define keys de chrome). Es el caso One Dark Pro Flat y temas minimal.
 * En esos temas las barras se funden con el fondo: hace falta un borde que
 * las separe (los slots nativos siempre lo tienen).
 */
function isFlatChrome(raw: Record<string, string | undefined>): boolean {
  const chrome = [
    'sideBar.background',
    'activityBar.background',
    'titleBar.activeBackground',
    'statusBar.background'
  ]
  const values = new Set(
    chrome
      .map((k) => raw[k])
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map((v) => v.toLowerCase())
  )
  const defined = [...values]
  // Sin keys de chrome, o todas iguales → flat.
  if (defined.length <= 1) return true
  // Chrome presente pero idéntico al editor → también flat a efectos visuales.
  const editor = raw['editor.background']?.toLowerCase()
  return defined.length === 1 && editor !== undefined && defined[0] === editor
}

/** Deriva un borde visible para temas flat: hover oscurecido/aclarado. */
function flatBorderFrom(hover: string | undefined, fallback: string): string {
  if (!hover) return fallback
  const m = /^#([0-9a-fA-F]{6})$/.exec(hover.trim())
  if (!m) return hover
  const r = parseInt(m[1].slice(0, 2), 16)
  const g = parseInt(m[1].slice(2, 4), 16)
  const b = parseInt(m[1].slice(4, 6), 16)
  // +8% hacia blanco: sutil como el color-mix 35% de los slots, en sólido.
  const lift = (c: number): number => Math.min(255, Math.round(c + (255 - c) * 0.12))
  return `#${[lift(r), lift(g), lift(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** Mapeo VS Code → SEF ThemeColors (solo keys que el schema acepta). */
function mapColors(
  raw: Record<string, string | undefined>,
  type: 'dark' | 'light'
): SefThemeColors {
  const defaults = VSCODE_DEFAULT_WORKBENCH[type]
  const editorBg = pick(raw, 'editor.background')
  const borderRaw = pick(raw, 'panel.border', 'sideBar.border', 'editorGroup.border', 'contrastBorder')
  // Fiel al backup (toScrakk.ts): bg ← editor.background, surface ← sideBar.
  // El chrome (barras) sigue al sideBar; el fondo general al editor. Si el
  // tema solo define editor.background, el chrome cae a defaults VS Code —
  // nunca aplana todo al mismo color.
  const surface = pick(raw, 'sideBar.background') ?? defaults.sideBarBackground
  const out: SefThemeColors = {
    bg: editorBg ?? pick(raw, 'editorGroupHeader.tabsBackground'),
    surface,
    surfaceRaised:
      pick(raw, 'tab.activeBackground', 'editorGroupHeader.tabsBackground') ?? surface,
    border: solidOf(borderRaw),
    accent: solidOf(
      pick(
        raw,
        'activityBarBadge.background',
        'button.background',
        'progressBar.background',
        'focusBorder'
      )
    ),
    text: pick(raw, 'editor.foreground', 'foreground'),
    textSecondary: pick(raw, 'sideBar.foreground', 'descriptionForeground'),
    textMuted: pick(raw, 'tab.inactiveForeground', 'disabledForeground'),
    error: pick(raw, 'errorForeground', 'editorError.foreground'),
    warning: pick(raw, 'editorWarning.foreground', 'list.warningForeground'),
    success: pick(raw, 'terminal.ansiGreen', 'gitDecoration.addedResourceForeground'),
    info: pick(raw, 'terminal.ansiBlue', 'editorInfo.foreground'),
    scrollbarThumb: solidOf(pick(raw, 'scrollbarSlider.background', 'scrollbarSlider.activeBackground')),
    indentGuide: solidOf(pick(raw, 'editorIndentGuide.background1', 'editorIndentGuide.background')),
    editorBg,
    titleBarBg:
      pick(raw, 'titleBar.activeBackground', 'titleBar.inactiveBackground', 'titleBar.background') ??
      surface,
    activityBarBg: pick(raw, 'activityBar.background') ?? surface,
    statusBarBg:
      pick(raw, 'statusBar.background', 'statusBar.noFolderBackground') ?? surface,
    // Estados (tabs activas usan --color-hover): keys de listas/tabs VS Code.
    hover: pick(
      raw,
      'list.hoverBackground',
      'tab.inactiveBackground',
      'editorGroupHeader.tabsBackground'
    ),
    active: pick(raw, 'list.activeSelectionBackground', 'list.inactiveSelectionBackground')
  }
  const borderSolid = solidOf(borderRaw)
  if (borderSolid) {
    out.panelBorder = borderSolid
    const op = opacityOf(borderRaw)
    if (op !== undefined) out.panelBorderOpacity = op
  } else if (isFlatChrome(raw)) {
    // Tema flat (One Dark Pro Flat…): sin borde propio, las barras se funden
    // con el fondo. Se deriva uno del hover para que se separen como los
    // slots nativos.
    out.panelBorder = flatBorderFrom(out.hover ?? out.accent, '#3e4452')
    out.panelBorderOpacity = 100
  }
  // Sin undefined: el schema es tolerante pero el JSON queda limpio.
  for (const k of Object.keys(out) as Array<keyof SefThemeColors>) {
    if (out[k] === undefined) delete out[k]
  }
  return out
}

function mapTokenColors(raw: unknown): Array<{ scope: string | string[]; foreground?: string; fontStyle?: string }> | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: Array<{ scope: string | string[]; foreground?: string; fontStyle?: string }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as {
      scope?: string | string[]
      settings?: { foreground?: string; fontStyle?: string }
    }
    if (!rec.scope) continue
    const entry: { scope: string | string[]; foreground?: string; fontStyle?: string } = {
      scope: rec.scope
    }
    if (typeof rec.settings?.foreground === 'string') entry.foreground = rec.settings.foreground
    const fs = rec.settings?.fontStyle
    if (fs === 'italic' || fs === 'bold' || fs === 'underline') entry.fontStyle = fs
    out.push(entry)
  }
  return out.length > 0 ? out : undefined
}

export function translateColorThemes(
  manifest: VsixPackageJson,
  files: VsixFileEntry[],
  opts: { extensionId: string }
): ThemesTranslation {
  const contributions: ThemesTranslation['contributions'] = []
  const assets = new Map<string, string>()
  const mapped: MappedApi[] = []

  const list = manifest.contributes?.themes ?? []
  list.forEach((theme, index) => {
    if (!theme || typeof theme.path !== 'string') return
    const raw = loadThemeJsonResolved(theme.path, files)
    if (!raw || !hasThemeBody(raw)) {
      mapped.push({
        source: `themes:${theme.label || theme.path}`,
        target: null,
        support: 'none',
        note: !raw ? `no se encontró ${theme.path} en el vsix` : 'tema sin colors ni tokenColors'
      })
      return
    }

    const colors = (raw.colors || {}) as Record<string, string | undefined>
    const editorBg = pick(colors, 'editor.background')
    const type = inferType(theme.uiTheme, raw.type, editorBg)
    const sefColors = mapColors(colors, type)
    const tokenColors = mapTokenColors(raw.tokenColors)
    const flat = isFlatChrome(colors)

    const base = slugify(theme.id || theme.path || theme.label || `theme-${index}`)
    const sefId = slugify(`${opts.extensionId}-${base}`).slice(0, 80)
    const name = theme.label || base

    const definition: Record<string, unknown> = { name, type, colors: sefColors }
    // Flag flat: las barras le ponen borde (--chrome-border) porque su fondo
    // es idéntico al del chrome y sin él se funden.
    if (flat) definition.flat = true
    if (tokenColors) definition.tokenColors = tokenColors

    const assetPath = `themes/${sefId}.json`
    assets.set(assetPath, JSON.stringify(definition))
    contributions.push({ id: sefId, name, type, path: assetPath })
    mapped.push({
      source: `themes:${theme.label || base}`,
      target: 'SEF contributes.themes',
      support: 'full',
      note: `${Object.keys(sefColors).length} colores, ${tokenColors?.length ?? 0} tokens`
    })
  })

  return { contributions, assets, mapped }
}

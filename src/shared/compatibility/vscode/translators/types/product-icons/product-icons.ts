// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Traductor product-icons: vsix productIconThemes → SEF productIcons.
 * Port fiel de scrakk contributions/product-icon-themes/load.ts.
 *
 * Entrada: contributes.productIconThemes + bytes del .vsix.
 * Salida: contribuciones SEF {id, name, path: productIcons/<id>.json} +
 * assets (SEF ProductIconTheme: {id, name, iconDefinitions, fonts} con
 * data URIs embebidas y font-family namespaced por el converter).
 */

import type { MappedApi, VsixFileEntry, VsixPackageJson } from '../../../../types'
import { decodeText, resolveThemeAsset, resolveVsixFile, toBase64Binary } from '../../../extract'

export interface ProductIconsTranslation {
  contributions: Array<{ id: string; name: string; path: string }>
  assets: Map<string, string>
  mapped: MappedApi[]
}

export function detectProductIconThemes(manifest: VsixPackageJson): boolean {
  const list = manifest.contributes?.productIconThemes
  return Array.isArray(list) && list.length > 0
}

export function sanitizeProductId(raw: string): string {
  return (
    String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'product-icons'
  )
}

type FontFormat = 'woff' | 'woff2' | 'truetype' | 'opentype'

function fontFormatFromPath(path: string): FontFormat {
  const l = path.toLowerCase()
  if (l.endsWith('.woff2')) return 'woff2'
  if (l.endsWith('.ttf')) return 'truetype'
  if (l.endsWith('.otf')) return 'opentype'
  return 'woff'
}

function mimeForFormat(fmt: FontFormat): string {
  switch (fmt) {
    case 'woff2':
      return 'font/woff2'
    case 'truetype':
      return 'font/ttf'
    case 'opentype':
      return 'font/otf'
    default:
      return 'font/woff'
  }
}

/**
 * La extensión del archivo MIENTE a veces (un .woff2 que por dentro es
 * woff/ttf). El navegador rechaza el @font-face y el glyph queda en tofu
 * permanente. Se husmean los magic bytes y manda lo real.
 */
export function sniffFontFormat(data: Uint8Array, fallback: FontFormat): FontFormat {
  if (data.length >= 4) {
    const magic = String.fromCharCode(data[0], data[1], data[2], data[3])
    if (magic === 'wOF2') return 'woff2'
    if (magic === 'wOFF') return 'woff'
    if (magic === 'OTTO') return 'opentype'
    if (data[0] === 0x00 && data[1] === 0x01 && data[2] === 0x00 && data[3] === 0x00) {
      return 'truetype'
    }
  }
  return fallback
}

export function translateProductIconThemes(
  manifest: VsixPackageJson,
  files: VsixFileEntry[],
  opts: { extensionId: string }
): ProductIconsTranslation {
  const contributions: ProductIconsTranslation['contributions'] = []
  const assets = new Map<string, string>()
  const mapped: MappedApi[] = []

  const list = manifest.contributes?.productIconThemes ?? []
  for (const theme of list) {
    if (!theme || typeof theme.path !== 'string') continue
    const themeFile = resolveVsixFile(theme.path, files)
    if (!themeFile) {
      mapped.push({
        source: `productIconThemes:${theme.id ?? theme.path}`,
        target: null,
        support: 'none',
        note: `no se encontró ${theme.path} en el vsix`
      })
      continue
    }

    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(decodeText(themeFile.data)) as Record<string, unknown>
    } catch {
      mapped.push({
        source: `productIconThemes:${theme.id ?? theme.path}`,
        target: null,
        support: 'none',
        note: 'JSON inválido'
      })
      continue
    }

    const sefId = sanitizeProductId(`${opts.extensionId}-${theme.id}`)
    const familyBase = sefId.replace(/[^a-zA-Z0-9_-]/g, '_')

    // Fuentes → data URIs. Se prueban TODOS los src en orden (el primero
    // suele ser woff2 con fallback woff); las rutas rotas se saltan.
    // Las fuentes sin bytes utilizables se omiten (no pueden pintar).
    const fonts: Array<{
      id: string
      family: string
      dataUri: string
      format: FontFormat
      weight?: string
      style?: string
    }> = []
    const fontsSpec = (raw.fonts || []) as Array<{
      id?: string
      src?: Array<{ path?: string; format?: string }>
      weight?: string
      style?: string
    }>
    let skippedFonts = 0
    fontsSpec.forEach((f, i) => {
      const fontId = typeof f.id === 'string' && f.id ? f.id : `font-${i}`
      for (const src of f.src ?? []) {
        if (!src?.path) continue
        // Se prueban TODOS los src en orden; las rutas se resuelven contra
        // el directorio del tema (absolutas, ../ y backslashes incluidos).
        const assetPath = resolveThemeAsset(theme.path, src.path)
        const file =
          (assetPath ? resolveVsixFile(assetPath, files) : null) ??
          resolveVsixFile(src.path, files)
        if (!file || file.data.length === 0) continue
        const format = sniffFontFormat(file.data, fontFormatFromPath(src.path))
        fonts.push({
          id: fontId,
          family: `${familyBase}-${fontId}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
          dataUri: `data:${mimeForFormat(format)};base64,${toBase64Binary(file.data)}`,
          format,
          weight: typeof f.weight === 'string' ? f.weight : undefined,
          style: typeof f.style === 'string' ? f.style : undefined
        })
        break
      }
      if (!fonts.some((x) => x.id === fontId)) skippedFonts++
    })

    // Definiciones: solo las que traen fontCharacter.
    const iconDefinitions: Record<string, { fontCharacter: string; fontId?: string }> = {}
    const defs = (raw.iconDefinitions || {}) as Record<string, { fontCharacter?: string; fontId?: string }>
    for (const [defId, def] of Object.entries(defs)) {
      if (!def || typeof def.fontCharacter !== 'string' || !def.fontCharacter) continue
      iconDefinitions[defId] = {
        fontCharacter: def.fontCharacter,
        fontId: typeof def.fontId === 'string' ? def.fontId : undefined
      }
    }

    if (fonts.length === 0 || Object.keys(iconDefinitions).length === 0) {
      mapped.push({
        source: `productIconThemes:${theme.id}`,
        target: null,
        support: 'none',
        note:
          fonts.length === 0
            ? `ninguna fuente utilizable (${skippedFonts} descartada(s))`
            : 'sin definiciones utilizables'
      })
      continue
    }

    const sefTheme = {
      id: sefId,
      name: theme.label || theme.id,
      iconDefinitions,
      fonts
    }
    const assetPath = `productIcons/${sefId}.json`
    assets.set(assetPath, JSON.stringify(sefTheme))
    contributions.push({ id: sefId, name: theme.label || theme.id, path: assetPath })
    mapped.push({
      source: `productIconThemes:${theme.id}`,
      target: 'SEF contributes.productIcons',
      support: 'full',
      note: `${Object.keys(iconDefinitions).length} iconos, ${fonts.length} fuente(s) embebidas`
    })
  }

  return { contributions, assets, mapped }
}

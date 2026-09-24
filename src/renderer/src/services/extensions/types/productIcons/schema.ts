// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'productIcons' — schema declarativo.
 *
 * Dos capas (igual que fileIcons/themes):
 *  1. Slice `contributes.productIcons` del manifest: {id, name, path}.
 *  2. El JSON del tema (`normalizeProductIconThemeDefinition`): formato SEF
 *     productIcons — NO 1:1 VS Code (por algo existe el traductor).
 *     iconDefinitions: id → {fontCharacter, fontId?}; fonts: [{id, dataUri…}].
 *     Solo se aceptan data URIs (offline, un solo readFile).
 */

import type { ParseContext } from '../handler'
import type { ProductIconTheme } from '@services/productIcons'

// ── Slice del manifest ─────────────────────────────────────────────────────

export interface ProductIconContribution {
  /** Id único del tema (global entre todas las extensiones). */
  id: string
  /** Nombre visible en el picker. */
  name: string
  /** Ruta del JSON del tema relativa a la raíz del paquete. */
  path: string
}

export function parseProductIconContributions(
  raw: unknown,
  _ctx: ParseContext
): ProductIconContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: ProductIconContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<ProductIconContribution>
    if (
      typeof c.id !== 'string' ||
      typeof c.name !== 'string' ||
      typeof c.path !== 'string'
    ) {
      console.warn('[extensions/productIcons] contribución inválida descartada:', c)
      continue
    }
    out.push({ id: c.id, name: c.name, path: c.path })
  }
  return out
}

// ── Definición del tema (el JSON del archivo) ──────────────────────────────

const VALID_FONT_FORMATS = new Set(['woff', 'woff2', 'truetype', 'opentype'])

function isDataUri(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:')
}

/**
 * Valida y normaliza el JSON crudo de un tema de iconos de producto.
 * Tolerante: descarta fuentes sin data URI y definiciones sin fontCharacter.
 */
export function normalizeProductIconThemeDefinition(raw: unknown): ProductIconTheme | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const id = typeof r.id === 'string' ? r.id : ''
  const name = typeof r.name === 'string' ? r.name : ''
  if (!id || !name) {
    console.warn('[extensions/productIcons] JSON de iconos sin id/name válido')
    return null
  }

  const fonts: ProductIconTheme['fonts'] = []
  if (Array.isArray(r.fonts)) {
    for (const item of r.fonts) {
      if (!item || typeof item !== 'object') continue
      const f = item as Record<string, unknown>
      if (typeof f.id !== 'string' || !isDataUri(f.dataUri)) {
        console.warn('[extensions/productIcons] fuente sin id/dataUri, se descarta')
        continue
      }
      const format =
        typeof f.format === 'string' && VALID_FONT_FORMATS.has(f.format)
          ? (f.format as ProductIconTheme['fonts'][number]['format'])
          : ('woff' as const)
      fonts.push({
        id: f.id,
        family: typeof f.family === 'string' && f.family ? f.family : `scrakk-product-${id}-${f.id}`,
        dataUri: f.dataUri,
        format,
        weight: typeof f.weight === 'string' ? f.weight : undefined,
        style: typeof f.style === 'string' ? f.style : undefined
      })
    }
  }

  const iconDefinitions: ProductIconTheme['iconDefinitions'] = {}
  if (r.iconDefinitions && typeof r.iconDefinitions === 'object') {
    for (const [k, v] of Object.entries(r.iconDefinitions as Record<string, unknown>)) {
      if (typeof k !== 'string' || !v || typeof v !== 'object') continue
      const d = v as Record<string, unknown>
      if (typeof d.fontCharacter !== 'string' || !d.fontCharacter) continue
      iconDefinitions[k] = {
        fontCharacter: d.fontCharacter,
        fontId: typeof d.fontId === 'string' ? d.fontId : undefined
      }
    }
  }

  if (fonts.length === 0 || Object.keys(iconDefinitions).length === 0) {
    console.warn('[extensions/productIcons] tema sin fuentes ni definiciones útiles')
    return null
  }

  return { id, name, iconDefinitions, fonts }
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'productIcons' — API hacia la capa extensions.
 *
 * Handler declarativo puro: un tema es DATA (JSON validado por schema.ts),
 * sin ejecución de código — misma filosofía SEF que fileIcons/themes.
 *
 * Resolución:
 *  - Builtin → product-icons.json embebido por convención
 *    (`builtin/productIcons/<ext-id>/product-icons.json`).
 *  - Instalada (.sef) → ctx.readFile(path) + normalize.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import {
  parseProductIconContributions,
  normalizeProductIconThemeDefinition,
  type ProductIconContribution
} from './schema'
import { registerProductIconThemeEntry, unregisterProductIconThemeEntry } from './logic'

const builtinProductIconFiles = import.meta.glob<{ default: unknown }>(
  '../../builtin/productIcons/*/product-icons.json',
  { eager: true }
)

function builtinRawDefinition(extensionId: string): unknown | null {
  const suffix = `/builtin/productIcons/${extensionId}/product-icons.json`
  const match = Object.entries(builtinProductIconFiles).find(([path]) => path.endsWith(suffix))
  return match ? match[1].default : null
}

interface RegisteredProductIconRef {
  id: string
}

export const productIconsHandler: AnyExtensionTypeHandler = {
  kind: 'productIcons',

  parse(raw, ctx): ProductIconContribution[] | null {
    return parseProductIconContributions(raw, ctx)
  },

  async register(
    contribution: ProductIconContribution,
    ctx: ExtensionTypeContext
  ): Promise<RegisteredProductIconRef | null> {
    let rawDefinition: unknown = null

    if (ctx.isBuiltin) {
      rawDefinition = builtinRawDefinition(ctx.extensionId)
      if (rawDefinition === null) {
        console.warn(
          `[extensions/productIcons] builtin "${ctx.extensionId}" sin product-icons.json`
        )
      }
    } else {
      const content = await ctx.readFile(contribution.path)
      if (content !== null) {
        try {
          rawDefinition = JSON.parse(content)
        } catch (error) {
          console.warn(
            `[extensions/productIcons] "${contribution.id}" JSON inválido (${contribution.path}):`,
            error
          )
        }
      }
    }

    const definition = normalizeProductIconThemeDefinition(rawDefinition)
    if (!definition) {
      console.warn(`[extensions/productIcons] tema "${contribution.id}" sin definición válida`)
      return null
    }

    registerProductIconThemeEntry({
      id: contribution.id,
      name: contribution.name,
      extensionId: ctx.extensionId,
      isBuiltin: ctx.isBuiltin,
      theme: { ...definition, id: contribution.id, name: contribution.name }
    })

    return { id: contribution.id }
  },

  unregister(owned) {
    for (const ref of owned) {
      unregisterProductIconThemeEntry(ref.id)
    }
  }
}

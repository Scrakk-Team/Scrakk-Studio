// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'themes' — API hacia la capa extensions.
 *
 * Handler declarativo puro: un tema es DATA (JSON validado por schema.ts),
 * sin ejecución de código — misma filosofía SEF que paneles/botones/tabs.
 *
 * Resolución de la definición:
 *  - Builtin → theme.json embebido en el bundle por convención de carpeta
 *    (`builtin/themes/<id>/theme.json`), detectado con import.meta.glob.
 *  - Instalada (.sef) → ctx.readFile(path) + normalizeThemeDefinition.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import {
  parseThemeContributions,
  normalizeThemeDefinition,
  type ThemeContribution
} from './schema'
import {
  registerTheme,
  unregisterTheme,
  reactivateIfStored
} from './logic'

/**
 * Temas builtin: JSONs embebidos por Vite en build-time.
 * Convención de carpeta: builtin/themes/<ext-id>/theme.json.
 * (2 niveles desde types/themes/: ../../ = services/extensions/)
 */
const builtinThemeFiles = import.meta.glob<{ default: unknown }>(
  '../../builtin/themes/*/theme.json',
  { eager: true }
)

function builtinRawDefinition(extensionId: string): unknown | null {
  const suffix = `/builtin/themes/${extensionId}/theme.json`
  const match = Object.entries(builtinThemeFiles).find(([path]) => path.endsWith(suffix))
  return match ? match[1].default : null
}

interface RegisteredThemeRef {
  id: string
}

export const themesHandler: AnyExtensionTypeHandler = {
  kind: 'themes',

  parse(raw, ctx): ThemeContribution[] | null {
    return parseThemeContributions(raw, ctx)
  },

  async register(
    contribution: ThemeContribution,
    ctx: ExtensionTypeContext
  ): Promise<RegisteredThemeRef | null> {
    let rawDefinition: unknown = null

    if (ctx.isBuiltin) {
      rawDefinition = builtinRawDefinition(ctx.extensionId)
      if (rawDefinition === null) {
        console.warn(
          `[extensions/themes] builtin "${ctx.extensionId}" sin theme.json (¿builtin/themes/${ctx.extensionId}/theme.json?)`
        )
      }
    } else {
      const content = await ctx.readFile(contribution.path)
      if (content !== null) {
        try {
          rawDefinition = JSON.parse(content)
        } catch (error) {
          console.warn(
            `[extensions/themes] "${contribution.id}" JSON inválido (${contribution.path}):`,
            error
          )
        }
      }
    }

    const definition = normalizeThemeDefinition(rawDefinition)
    if (!definition) {
      console.warn(`[extensions/themes] tema "${contribution.id}" sin definición válida`)
      return null
    }

    registerTheme({
      id: contribution.id,
      name: contribution.name,
      type: contribution.type,
      extensionId: ctx.extensionId,
      isBuiltin: ctx.isBuiltin,
      definition
    })

    // Persistencia across reloads: si este tema era el activo guardado, vuelve.
    reactivateIfStored(contribution.id, ctx.extensionId)

    return { id: contribution.id }
  },

  unregister(owned) {
    for (const ref of owned) {
      unregisterTheme(ref.id)
    }
  }
}

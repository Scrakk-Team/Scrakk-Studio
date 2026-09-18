/**
 * Tipo 'fileIcons' — API hacia la capa extensions.
 *
 * Handler declarativo puro: un tema es DATA (JSON validado por schema.ts),
 * sin ejecución de código — misma filosofía SEF que themes.
 *
 * Resolución:
 *  - Builtin → icons.json embebido por convención
 *    (`builtin/fileIcons/<ext-id>/icons.json`), detectado con import.meta.glob.
 *  - Instalada (.sef) → ctx.readFile(path) + normalizeFileIconThemeDefinition.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import {
  parseFileIconContributions,
  normalizeFileIconThemeDefinition,
  type FileIconContribution
} from './schema'
import { registerFileIconThemeEntry, unregisterFileIconThemeEntry } from './logic'

/**
 * Temas builtin: JSONs embebidos por Vite en build-time.
 * Convención: builtin/fileIcons/<ext-id>/icons.json.
 */
const builtinIconFiles = import.meta.glob<{ default: unknown }>(
  '../../builtin/fileIcons/*/icons.json',
  { eager: true }
)

function builtinRawDefinition(extensionId: string): unknown | null {
  const suffix = `/builtin/fileIcons/${extensionId}/icons.json`
  const match = Object.entries(builtinIconFiles).find(([path]) => path.endsWith(suffix))
  return match ? match[1].default : null
}

interface RegisteredFileIconRef {
  id: string
}

export const fileIconsHandler: AnyExtensionTypeHandler = {
  kind: 'fileIcons',

  parse(raw, ctx): FileIconContribution[] | null {
    return parseFileIconContributions(raw, ctx)
  },

  async register(
    contribution: FileIconContribution,
    ctx: ExtensionTypeContext
  ): Promise<RegisteredFileIconRef | null> {
    let rawDefinition: unknown = null

    if (ctx.isBuiltin) {
      // El builtin puede traer VARIOS temas en un solo icons.json? No: uno
      // por extensión (convención 1:1 como themes). El contribution.id debe
      // coincidir con el theme.id del JSON (si difiere, manda el manifest).
      rawDefinition = builtinRawDefinition(ctx.extensionId)
      if (rawDefinition === null) {
        console.warn(
          `[extensions/fileIcons] builtin "${ctx.extensionId}" sin icons.json (¿builtin/fileIcons/${ctx.extensionId}/icons.json?)`
        )
      }
    } else {
      const content = await ctx.readFile(contribution.path)
      if (content !== null) {
        try {
          rawDefinition = JSON.parse(content)
        } catch (error) {
          console.warn(
            `[extensions/fileIcons] "${contribution.id}" JSON inválido (${contribution.path}):`,
            error
          )
        }
      }
    }

    const definition = normalizeFileIconThemeDefinition(rawDefinition)
    if (!definition) {
      console.warn(`[extensions/fileIcons] tema "${contribution.id}" sin definición válida`)
      return null
    }

    registerFileIconThemeEntry({
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
      unregisterFileIconThemeEntry(ref.id)
    }
  }
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Handler del tipo `encodings` — contrato ExtensionTypeHandler.
 */

import type { ExtensionTypeHandler } from '../handler'
import type { EncodingContribution } from './schema'
import { validateEncodingContribution } from './schema'
import { registerEncodingsContribution, unregisterEncodings } from './logic'
import type { RegisteredEncoding } from './logic'

export interface EncodingsParseContext {
  hasModule: (path: string) => boolean
}

export const encodingsHandler: ExtensionTypeHandler<
  EncodingContribution,
  RegisteredEncoding
> = {
  kind: 'encodings',

  parse(raw, ctx): EncodingContribution[] | null {
    if (!Array.isArray(raw)) return null
    const out: EncodingContribution[] = []
    for (const item of raw) {
      const valid = validateEncodingContribution(item, isBuiltin, consoleWarn)
      if (valid && ctx.hasModule(valid.module)) {
        out.push(valid)
      }
    }
    return out.length > 0 ? out : null
  },

  async register(contribution, ctx): Promise<RegisteredEncoding | null> {
    // Lee el módulo del paquete (builtin → resolver; .sef → readFile).
    const source = await ctx.readFile(contribution.module)
    if (!source) {
      consoleWarn(`[encodings] no se pudo leer ${contribution.module}`)
      return null
    }
    return registerEncodingsContribution(ctx.extensionId, contribution, source)
  },

  unregister(owned: RegisteredEncoding[]): void {
    for (const entry of owned) unregisterEncodings(entry)
  }
}

function isBuiltin(id: string): boolean {
  // Lista mínima espejo para validar en renderer; la verdad está en main.
  return ['utf8', 'utf8-bom', 'utf16le', 'utf16le-bom', 'utf16be', 'utf16be-bom', 'latin1'].includes(id)
}

function consoleWarn(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(msg)
}

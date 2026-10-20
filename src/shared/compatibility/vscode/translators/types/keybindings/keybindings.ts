// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Traductor keybindings: `contributes.keybindings` del package.json → SEF
 * `keybindings` (el kind nuevo, ver `docs/extensions/reference/contributes.md`).
 *
 * Se traduce `{ command, key }`. Se omite (y se cuenta) lo que no tiene
 * equivalente honesto:
 *  - `when`: nuestro kind no soporta contexto (aplicarlo global cambiaría el
 *    comportamiento).
 *  - comandos negativos (`-command`): no tenemos "desbind" de defaults.
 *  - teclas de macOS (`cmd`/`meta`): Scrakk no soporta macOS.
 */

import type { MappedApi, VsixFileEntry, VsixPackageJson } from '../../../../types'

export interface KeybindingsTranslation {
  contributions: Array<{ command: string; key: string }>
  assets: Map<string, string | Uint8Array>
  mapped: MappedApi[]
}

const MAC_MODIFIER = /\b(cmd|command|meta)\b/i

export function detectKeybindings(manifest: VsixPackageJson): boolean {
  const list = manifest.contributes?.keybindings
  return Array.isArray(list) && list.length > 0
}

export function translateKeybindings(
  manifest: VsixPackageJson,
  _files: VsixFileEntry[],
  _opts: { extensionId: string }
): KeybindingsTranslation {
  const list = (manifest.contributes?.keybindings ?? []) as Array<Record<string, unknown>>
  const contributions: Array<{ command: string; key: string }> = []
  let skipped = 0

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      skipped += 1
      continue
    }
    const command = typeof entry.command === 'string' ? entry.command.trim() : ''
    const key = typeof entry.key === 'string' ? entry.key.trim() : ''
    if (
      !command ||
      !key ||
      command.startsWith('-') ||
      entry.when !== undefined ||
      MAC_MODIFIER.test(key)
    ) {
      skipped += 1
      continue
    }
    contributions.push({ command, key: key.toLowerCase().replace(/\s+/g, ' ') })
  }

  const mapped: MappedApi[] = contributions.length
    ? [
        {
          source: 'contributes.keybindings',
          target: 'keybindings',
          support: skipped > 0 ? 'partial' : 'full',
          note: skipped > 0 ? `${skipped} atajo(s) sin traducir (when/macOS/negativo)` : undefined
        }
      ]
    : []

  return { contributions, assets: new Map(), mapped }
}

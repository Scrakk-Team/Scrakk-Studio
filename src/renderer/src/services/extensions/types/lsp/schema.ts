/**
 * Tipo de extensión 'lspServers' — schema declarativo.
 *
 * Una extensión aporta language servers completos con la misma forma que
 * los builtin del core (command/extensions/rootMarkers/gatedBy/install).
 * El registro se sincroniza con el runtime del proceso main vía IPC
 * (window.api.lsp.registerDynamicServers) — prioridad:
 *   user > project (.scrakk/lsp.json) > dynamic (extensiones) > builtin.
 */

import type { DynamicLspServerDef } from '@shared/lsp'
import { parseLspServerConfig } from '@shared/lsp'
import type { ParseContext } from '../handler'

export interface LspContribution {
  /** Id único del server (global entre extensiones y builtins). */
  id: string
  command: string
  args?: string[]
  extensions: Record<string, string>
  rootMarkers?: string[]
  gatedBy?: string
  install?: NonNullable<DynamicLspServerDef['install']>
  initializationOptions?: unknown
  settings?: unknown
}

export function parseLspContributions(
  raw: unknown,
  _ctx: ParseContext
): LspContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: LspContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<LspContribution>
    const config = parseLspServerConfig(
      { command: c.command, args: c.args, extensions: c.extensions },
      String(c.id ?? '?')
    )
    if (!config || typeof c.id !== 'string') {
      console.warn('[extensions/lspServers] contribución inválida descartada:', c)
      continue
    }
    out.push({
      id: c.id,
      command: config.command,
      args: config.args,
      extensions: config.extensions ?? {},
      rootMarkers:
        Array.isArray(c.rootMarkers) && c.rootMarkers.every((m) => typeof m === 'string')
          ? (c.rootMarkers as string[])
          : undefined,
      gatedBy: typeof c.gatedBy === 'string' ? c.gatedBy : undefined,
      install: isValidInstallRecipe(c.install) ? c.install : undefined,
      initializationOptions: c.initializationOptions,
      settings: c.settings
    })
  }
  return out
}

function isValidInstallRecipe(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as { kind?: unknown }
  return (
    r.kind === 'npm' ||
    r.kind === 'go' ||
    r.kind === 'gem' ||
    r.kind === 'dotnet' ||
    r.kind === 'github' ||
    r.kind === 'custom'
  )
}

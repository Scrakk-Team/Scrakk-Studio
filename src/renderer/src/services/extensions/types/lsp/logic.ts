/**
 * Tipo de extensión 'lspServers' — lógica.
 *
 * Sincroniza las contribuciones con el runtime LSP del proceso main:
 * registerDynamicServers al instalar/boot, removeDynamicServers al
 * desinstalar. Sin estado propio: cada boot de extensiones re-registra.
 */

import type { DynamicLspServerDef } from '@shared/lsp'
import type { LspContribution } from './schema'

function toDynamicDef(contribution: LspContribution): DynamicLspServerDef {
  return {
    id: contribution.id,
    command: contribution.command,
    args: contribution.args,
    extensions: contribution.extensions,
    rootMarkers: contribution.rootMarkers,
    gatedBy: contribution.gatedBy,
    install: contribution.install,
    initializationOptions: contribution.initializationOptions,
    settings: contribution.settings
  }
}

export async function registerServers(
  extensionId: string,
  contributions: LspContribution[]
): Promise<string[]> {
  if (!window.api?.lsp || contributions.length === 0) return []
  const res = await window.api.lsp.registerDynamicServers(
    extensionId,
    contributions.map(toDynamicDef)
  )
  return res.registered
}

/** Registra UNA contribución (el main hace merge por sourceId). */
export async function registerServer(extensionId: string, contribution: LspContribution): Promise<void> {
  await registerServers(extensionId, [contribution])
}

export async function unregisterServers(extensionId: string): Promise<void> {
  await window.api?.lsp?.removeDynamicServers(extensionId)
}

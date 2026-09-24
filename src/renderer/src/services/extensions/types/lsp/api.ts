// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión 'lspServers' — API hacia la capa extensions.
 *
 * Handler declarativo: los servers son DATA validada por schema.ts y se
 * sincronizan con el runtime del proceso main (registerDynamicServers,
 * merge por id). Toda la potencia del core LSP queda disponible para la
 * extensión sin ejecutar código de ella.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import {
  parseLspContributions,
  type LspContribution
} from './schema'
import { registerServer, unregisterServers } from './logic'

interface RegisteredLspRef {
  extensionId: string
  serverId: string
}

export const lspHandler: AnyExtensionTypeHandler = {
  kind: 'lspServers',

  parse(raw, ctx): LspContribution[] | null {
    return parseLspContributions(raw, ctx)
  },

  async register(
    contribution: LspContribution,
    ctx: ExtensionTypeContext
  ): Promise<RegisteredLspRef> {
    // `extensionPath` para un server que viaja DENTRO del paquete (`./…`).
    await registerServer(ctx.extensionId, contribution, ctx.extensionPath)
    return { extensionId: ctx.extensionId, serverId: contribution.id }
  },

  unregister(owned) {
    // La desregistración es por EXTENSIÓN completa (sourceId); con varias
    // contribuciones owned la primera limpia y las demás son no-ops.
    const first = owned[0] as RegisteredLspRef | undefined
    if (first?.extensionId) {
      void unregisterServers(first.extensionId)
    }
  }
}

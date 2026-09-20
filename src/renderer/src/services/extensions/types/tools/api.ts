/**
 * Tipo de extensión 'tools' — API hacia la capa extensions.
 *
 * Registra herramientas de IA aportadas por un `.sef`: misma forma y mismo
 * registry que las tools built-in, con visual propio opcional y ejecución por
 * comando en el Extension Host.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import { parseToolContributions, type ToolContribution } from './schema'
import { registerTool, type RegisteredToolRef } from './logic'
import { unregisterTools } from './store'

export const toolsHandler: AnyExtensionTypeHandler = {
  kind: 'tools',

  parse(raw, ctx): ToolContribution[] | null {
    return parseToolContributions(raw, ctx)
  },

  register(contribution: ToolContribution, ctx: ExtensionTypeContext): RegisteredToolRef {
    return registerTool(contribution, ctx)
  },

  unregister(owned: RegisteredToolRef[]) {
    unregisterTools(owned)
  }
}

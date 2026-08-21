/**
 * Tipo 'centerTabs' — API hacia la capa extensions.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import type { RegisteredCenterTab } from '../../manifest'
import {
  parseCenterTabContributions,
  type CenterTabContribution
} from './schema'
import { registerCenterTab } from './logic'
import { unregisterCenterTabs } from './store'

export const centerTabsHandler: AnyExtensionTypeHandler = {
  kind: 'centerTabs',

  parse(raw, ctx): CenterTabContribution[] | null {
    return parseCenterTabContributions(raw, ctx)
  },

  register(contribution: CenterTabContribution, ctx: ExtensionTypeContext): RegisteredCenterTab {
    return registerCenterTab(contribution, ctx.resolver, ctx.extensionId)
  },

  unregister(owned) {
    unregisterCenterTabs(owned)
  }
}

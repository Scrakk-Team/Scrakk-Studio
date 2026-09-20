/**
 * Tipo de extensión 'skills' — API hacia la capa extensions.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import { parseSkillContributions, type SkillContribution } from './schema'
import { registerSkill, type RegisteredSkillRef } from './logic'
import { unregisterSkills } from './store'

export const skillsHandler: AnyExtensionTypeHandler = {
  kind: 'skills',

  parse(raw, ctx): SkillContribution[] | null {
    return parseSkillContributions(raw, ctx)
  },

  register(contribution: SkillContribution, ctx: ExtensionTypeContext): RegisteredSkillRef {
    return registerSkill(contribution, ctx)
  },

  unregister(owned: RegisteredSkillRef[]) {
    unregisterSkills(owned)
  }
}

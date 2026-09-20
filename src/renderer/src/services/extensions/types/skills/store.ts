/**
 * Tipo 'skills' — estado/bajas.
 */

import { skillRegistry } from '@services/skills'
import type { RegisteredSkillRef } from './logic'

export function unregisterSkills(owned: RegisteredSkillRef[]): void {
  for (const ref of owned) {
    skillRegistry.unregisterExtension(ref.extensionId)
  }
}

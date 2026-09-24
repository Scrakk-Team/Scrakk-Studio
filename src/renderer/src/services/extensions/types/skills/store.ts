// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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

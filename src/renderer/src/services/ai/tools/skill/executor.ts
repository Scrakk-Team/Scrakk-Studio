// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * skill — carga el cuerpo de una skill por nombre (divulgación progresiva:
 * el modelo ve nombre+descripción en `list_skills` y trae el cuerpo solo
 * cuando la necesita).
 */

import type { ExecutionResult, ToolContext } from '../types'
import { skillRegistry } from '@services/skills'

export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  const name = typeof args.name === 'string' ? args.name.trim() : ''
  if (!name) return { success: false, content: 'Missing skill name' }
  if (!skillRegistry.isEnabled(name)) {
    return { success: false, content: `Skill "${name}" is disabled.` }
  }
  const content = await skillRegistry.load(name)
  if (!content) {
    return { success: false, content: `Skill "${name}" not found. Call list_skills to see available skills.` }
  }
  return { success: true, content: content.body }
}

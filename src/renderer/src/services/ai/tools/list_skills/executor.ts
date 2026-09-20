/**
 * list_skills — devuelve las skills disponibles (habilitadas) como JSON.
 */

import type { ExecutionResult, ToolContext } from '../types'
import { skillRegistry } from '@services/skills'

export async function execute(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  const skills = skillRegistry.listEnabled()
  if (skills.length === 0) {
    return {
      success: true,
      content: 'No hay skills instaladas. El usuario puede crearlas en .scrakk/skills/<nombre>/SKILL.md.'
    }
  }
  return {
    success: true,
    content: JSON.stringify(
      skills.map((skill) => ({ name: skill.name, description: skill.description, source: skill.source })),
      null,
      2
    )
  }
}

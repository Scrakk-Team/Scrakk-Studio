import type { ToolDefinition } from '../types'

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skill',
    description:
      "Load a skill's full instructions by name. Use it when a task matches a skill description returned by list_skills.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name (from list_skills).' }
      },
      required: ['name']
    }
  }
}

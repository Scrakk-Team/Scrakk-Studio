import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
export const createAppBlueprintTool: Tool = {
  name: 'create_app_blueprint',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'create_app_blueprint',
    label: 'Blueprint',
    description: 'Create an app blueprint',
    category: 'utility',
    dangerLevel: 'safe',
    enabledByDefault: true,
    expandable: true,
  },
  execute,
}

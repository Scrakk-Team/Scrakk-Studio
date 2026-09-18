import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { BlueprintCard } from './visual'
import displayCss from './visual/BlueprintCard.css?inline'

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
        icon: 'clipboard',
    headerArgKey: 'name',
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => <BlueprintCard args={args} result={result} status={status} />,
  },
  execute,
}

import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { ListSkillsCard } from './visual'
import displayCss from './visual/ListSkillsCard.css?inline'

export const listSkillsTool: Tool = {
  name: 'list_skills',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'list_skills',
    label: 'List Skills',
    description: 'List the available skills',
    category: 'skills',
    dangerLevel: 'safe',
    enabledByDefault: true,
    icon: 'layers',
    expandable: false,
    displayCss,
    renderBody: (args, result, status) => <ListSkillsCard args={args} result={result} status={status} />
  },
  execute
}

import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { SkillCard } from './visual'
import displayCss from './visual/SkillCard.css?inline'

export const skillTool: Tool = {
  name: 'skill',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'skill',
    label: 'Load Skill',
    description: 'Load a skill by name',
    type: 'skills',
    dangerLevel: 'safe',
    enabledByDefault: true,
    icon: 'bookmark',
    headerArgKey: 'name',
    expandable: false,
    displayCss,
    renderBody: (args, result, status) => <SkillCard args={args} result={result} status={status} />
  },
  execute
}

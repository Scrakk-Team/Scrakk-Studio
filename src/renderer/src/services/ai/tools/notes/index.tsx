// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { Tool } from '../types'
import { definition } from './definition'
import { execute } from './executor'
import { permissions } from './permissions'
import { prompt } from './prompt'
import { NotesCard } from './visual'
import displayCss from './visual/NotesCard.css?inline'
import { NotesModal } from './modal'

export const notesTool: Tool = {
  name: 'notes',
  definition,
  permissions,
  prompt,
  meta: {
    name: 'notes',
    label: 'Notes',
    description: "The user's notes",
    type: 'notes',
    dangerLevel: 'medium',
    enabledByDefault: true,
    icon: 'note',
    headerArgKey: ['action', 'id'],
    expandable: true,
    displayCss,
    renderBody: (args, result, status) => (
      <NotesCard args={args} result={result} status={status} />
    ),
    modal: NotesModal
  },
  execute
}

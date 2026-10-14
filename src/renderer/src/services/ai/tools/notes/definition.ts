// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tool definition for notes.
 */

import type { ToolDefinition } from '../types'

export const NOTE_ACTIONS = ['list', 'read', 'create', 'update', 'delete'] as const
export type NoteAction = (typeof NOTE_ACTIONS)[number]

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'notes',
    description:
      "Work with the user's Notes. Actions: `list` (the notes the AI may read from here), " +
      "`read` (a note's content), `create` (open a new note), `update` (rewrite a note's " +
      "content) and `delete`. A note is `global` (visible from every project) or `project` " +
      '(visible only from the project that owns it), and the user decides **per note** whether ' +
      'the AI may read, edit or delete it. Honour those permissions: a denied action returns an ' +
      'error you cannot override — ask the user to change it in the Notes panel instead.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [...NOTE_ACTIONS],
          description: 'Operation to perform.'
        },
        id: {
          type: 'string',
          description: 'Note id (required for read/update/delete).'
        },
        content: {
          type: 'string',
          description: 'Note body: the full content to write (required for create/update).'
        },
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description:
            'Where a new note lives (create only). Defaults to `project` when a project is open, otherwise `global`.'
        }
      },
      required: ['action']
    }
  }
}

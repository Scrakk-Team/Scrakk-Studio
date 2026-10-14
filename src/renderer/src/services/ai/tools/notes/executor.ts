// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Executor for notes.
 *
 * Todo pasa por `@services/notes` (su API de IA): acá no hay lógica de notas,
 * sólo el dispatch de la acción y el formato de la respuesta para el modelo.
 * El scope y los permisos `ai.read`/`edit`/`delete` los aplica la API.
 */

import type { ExecutionResult, ToolContext } from '../types'
import {
  aiCreateNote,
  aiDeleteNote,
  aiListNotes,
  aiReadNote,
  aiUpdateNote,
  noteTitle
} from '../../../notes'
import type { NoteScope } from '../../../notes'
import { policyEngine } from '../../policy/policy-engine'
import { modeRegistry } from '../../policy/modeRegistry'

/** Acciones que cambian notas (las que un modo read-only debe negar). */
const MUTATING_ACTIONS = new Set(['create', 'update', 'delete'])

/** ¿El modo activo es de sólo-lectura (p. ej. Plan)? Entonces no se escribe. */
function activeModeIsReadOnly(): boolean {
  try {
    return modeRegistry.get(policyEngine.getModeId())?.mutationBehavior === 'never'
  } catch {
    return false
  }
}

function ok(content: string): ExecutionResult {
  return { success: true, content }
}

function fail(content: string): ExecutionResult {
  return { success: false, content }
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export async function execute(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ExecutionResult> {
  const action = typeof args.action === 'string' ? args.action : ''
  const projectRoot = ctx.projectRoot || null

  // El modo read-only (Plan) no escribe notas. Las lecturas sí pasan.
  if (MUTATING_ACTIONS.has(action) && activeModeIsReadOnly()) {
    return fail(
      `The active mode is read-only: the AI cannot ${action} notes here. ` +
        'Ask the user to switch modes if they want this.'
    )
  }

  try {
    switch (action) {
      case 'list': {
        const notes = aiListNotes(projectRoot)
        if (notes.length === 0) {
          return ok('No notes are available to the AI here. The user may not have created any, or may not have allowed the AI to read them.')
        }
        return ok(JSON.stringify({ count: notes.length, notes }, null, 2))
      }

      case 'read': {
        const id = asId(args.id)
        if (!id) return fail('Required: id (use action "list" to get the ids).')
        const result = aiReadNote(id, projectRoot)
        if (!result.ok) return fail(result.error)
        return ok(
          JSON.stringify(
            {
              id: result.note.id,
              title: noteTitle(result.note.content),
              scope: result.note.scope,
              updated_at: result.note.updatedAt,
              content: result.note.content
            },
            null,
            2
          )
        )
      }

      case 'create': {
        const content = typeof args.content === 'string' ? args.content : ''
        const scope: NoteScope | undefined =
          args.scope === 'global' || args.scope === 'project' ? args.scope : undefined
        const result = aiCreateNote({ content, scope }, projectRoot)
        if (!result.ok) return fail(result.error)
        return ok(
          `Created ${result.note.scope} note "${result.note.id}". ` +
            'The user can rename its scope or revoke AI access from the Notes panel.'
        )
      }

      case 'update': {
        const id = asId(args.id)
        if (!id) return fail('Required: id (use action "list" to get the ids).')
        if (typeof args.content !== 'string') {
          return fail('Required: content (the full new body of the note).')
        }
        const result = aiUpdateNote(id, args.content, projectRoot)
        if (!result.ok) return fail(result.error)
        return ok(`Updated note "${id}".`)
      }

      case 'delete': {
        const id = asId(args.id)
        if (!id) return fail('Required: id (use action "list" to get the ids).')
        const result = aiDeleteNote(id, projectRoot)
        if (!result.ok) return fail(result.error)
        return ok(`Deleted note "${id}".`)
      }

      default:
        return fail(
          `Unknown action "${action}". Use one of: list, read, create, update, delete.`
        )
    }
  } catch (error) {
    return fail(`Notes error: ${error instanceof Error ? error.message : String(error)}`)
  }
}

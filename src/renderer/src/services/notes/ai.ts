// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Notas — API de la IA (acotada por los permisos de cada nota).
 *
 * Es la ÚNICA puerta que debería usar una herramienta/agente: aplica el
 * `scope` (una nota `project` no se ve desde otro proyecto) y los permisos
 * `ai.read` / `ai.edit` / `ai.delete` ANTES de tocar el store. El panel del
 * usuario usa el store directo; la IA pasa siempre por acá.
 *
 * Los mensajes de error van en inglés: los lee el modelo.
 */

import {
  createNote,
  deleteNote,
  getNote,
  listVisibleNotes,
  patchNote,
  noteTitle,
  type Note,
  type NoteScope
} from './store'

export interface NoteAiFailure {
  ok: false
  error: string
}
export interface NoteAiNoteOk {
  ok: true
  note: Note
}
export type NoteAiNoteResult = NoteAiNoteOk | NoteAiFailure

export interface NoteAiOk {
  ok: true
}
export type NoteAiResult = NoteAiOk | NoteAiFailure

/** Resumen de una nota para el listado de la IA (sin el contenido entero). */
export interface NoteSummary {
  id: string
  title: string
  scope: NoteScope
  updatedAt: number
  preview: string
}

const PREVIEW_CHARS = 160

function isVisible(note: Note, projectRoot: string | null | undefined): boolean {
  return note.scope === 'global' || (!!projectRoot && note.projectRoot === projectRoot)
}

/** Notas que la IA puede VER y LISTAR desde este proyecto. */
export function aiVisibleNotes(projectRoot: string | null | undefined): Note[] {
  return listVisibleNotes(projectRoot).filter((note) => note.ai.read)
}

/** Listado para la IA: sólo metadatos + un preview corto. */
export function aiListNotes(projectRoot: string | null | undefined): NoteSummary[] {
  return aiVisibleNotes(projectRoot).map((note) => ({
    id: note.id,
    title: noteTitle(note.content),
    scope: note.scope,
    updatedAt: note.updatedAt,
    preview: note.content.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_CHARS)
  }))
}

function lookup(id: string, projectRoot: string | null | undefined): Note | NoteAiFailure {
  const note = getNote(id)
  if (!note) return { ok: false, error: `Note "${id}" not found.` }
  if (!isVisible(note, projectRoot)) {
    return { ok: false, error: `Note "${id}" belongs to another project and is not visible here.` }
  }
  return note
}

function isFailure(value: Note | NoteAiFailure): value is NoteAiFailure {
  return (value as NoteAiFailure).ok === false
}

/** Lee una nota, si el usuario habilitó `read`. */
export function aiReadNote(
  id: string,
  projectRoot: string | null | undefined
): NoteAiNoteResult {
  const found = lookup(id, projectRoot)
  if (isFailure(found)) return found
  if (!found.ai.read) {
    return { ok: false, error: `The user has not allowed the AI to read note "${id}".` }
  }
  return { ok: true, note: found }
}

export interface NoteAiCreateInput {
  content?: string
  scope?: NoteScope
  /** Sólo para tests/explicit scope `project` sin proyecto abierto. */
  projectRoot?: string | null
}

/**
 * Crea una nota. Sin scope explícito, una `project` si hay proyecto abierto
 * (si no, `global`). Los permisos de IA son los defaults: read/edit sí,
 * delete no — que el usuario los ajuste si quiere.
 */
export function aiCreateNote(
  input: NoteAiCreateInput,
  currentProjectRoot: string | null | undefined
): NoteAiNoteResult {
  const scope: NoteScope =
    input.scope === 'global' || input.scope === 'project'
      ? input.scope
      : currentProjectRoot
        ? 'project'
        : 'global'
  const projectRoot = input.projectRoot ?? currentProjectRoot ?? null

  if (scope === 'project' && !projectRoot) {
    return { ok: false, error: 'Cannot create a project note: no project is open.' }
  }

  const note = createNote({
    content: input.content ?? '',
    scope,
    projectRoot: scope === 'project' ? projectRoot : null
  })
  return { ok: true, note }
}

/** Reescribe el contenido de una nota, si el usuario habilitó `edit`. */
export function aiUpdateNote(
  id: string,
  content: string,
  projectRoot: string | null | undefined
): NoteAiNoteResult {
  const found = lookup(id, projectRoot)
  if (isFailure(found)) return found
  if (!found.ai.edit) {
    return { ok: false, error: `The user has not allowed the AI to edit note "${id}".` }
  }
  const updated = patchNote(id, { content })
  if (!updated) return { ok: false, error: `Note "${id}" not found.` }
  return { ok: true, note: updated }
}

/** Borra una nota, si el usuario habilitó `delete`. */
export function aiDeleteNote(
  id: string,
  projectRoot: string | null | undefined
): NoteAiResult {
  const found = lookup(id, projectRoot)
  if (isFailure(found)) return found
  if (!found.ai.delete) {
    return { ok: false, error: `The user has not allowed the AI to delete note "${id}".` }
  }
  if (!deleteNote(id)) return { ok: false, error: `Note "${id}" not found.` }
  return { ok: true }
}

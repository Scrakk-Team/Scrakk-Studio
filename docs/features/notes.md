---
title: "Notes"
group: features
order: 80
summary: "The Notes panel: a small scratchpad store (create, list, edit, delete) with per-note config — global or project scope, and what the AI may do with it — and an API other modules (and the AI) call."
---
# Notes

The **Notes** panel is a lightweight scratchpad: create notes, list them, edit
inline, delete. It is a normal panel (`PANEL_REGISTRY` id `notes`,
`features/layout/panels/NotePanel/NotePanel.tsx`) with a **`+` header action** and
a store in `@services/notes`.

## The model

A note is a small object:

```ts
interface Note {
  id: string
  content: string
  scope: 'global' | 'project'   // where the note shows up
  projectRoot?: string          // the owner, when scope === 'project'
  ai: { read: boolean; edit: boolean; delete: boolean }
  createdAt: number
  updatedAt: number
}
```

- **`scope`** — a **global** note appears in every project; a **project** note
  appears only in the project that owns it (`projectRoot`). `listVisibleNotes(root)`
  is what both the panel and the AI use, so a project note disappears when you
  open another project.
- **`ai`** — what the AI may do with **that** note. Defaults for a new note:
  `read` and `edit` on, `delete` off. The user flips them from the panel.

## The store API

`@services/notes` is a tiny external store (CRUD + `subscribe`), persisted in
**localStorage** under `scrakk-studio:notes` (falls back to in-memory when there
is no storage). Older notes are migrated on load: no `scope` → `global`, no `ai`
→ the defaults above.

```ts
import {
  listNotes, listVisibleNotes, getNote, subscribeToNotes,
  createNote, updateNote, patchNote, setNoteConfig, deleteNote, noteTitle
} from '@services/notes'

listNotes()                          // all (or filter by scope/owner)
listVisibleNotes(projectRoot)        // global + this project's
const note = createNote({ content: '…' })          // global by default
createNote({ content: '…', scope: 'project', projectRoot })
updateNote(note.id, 'hello')         // content only (compat)
patchNote(note.id, { content, scope, ai: { delete: true } })
setNoteConfig(note.id, { scope: 'project', projectRoot })  // scope/owner/AI perms
deleteNote(note.id)
subscribeToNotes(() => setNotes(listVisibleNotes(projectRoot)))
```

- **Title**: derived from the first non-empty line (`noteTitle`).
- **Persistence**: the whole list is JSON-serialized to localStorage on every
  change; a corrupt value starts empty.

## The AI API

The AI never touches the store directly. `services/notes/ai.ts` is the guarded
door: it applies the **scope** and the `ai.read`/`edit`/`delete` flags **before**
touching anything, and returns an English error the model can surface but not
override.

```ts
import { aiListNotes, aiReadNote, aiCreateNote, aiUpdateNote, aiDeleteNote } from '@services/notes'

aiListNotes(projectRoot)             // only notes with ai.read, visible here
aiReadNote(id, projectRoot)          // { ok, note } | { ok: false, error }
aiCreateNote({ content, scope }, projectRoot)
aiUpdateNote(id, content, projectRoot)   // needs ai.edit
aiDeleteNote(id, projectRoot)            // needs ai.delete
```

The **`notes`** tool (`services/ai/tools/notes/`) is a thin wrapper over this API:
one tool with an `action` of `list` / `read` / `create` / `update` / `delete`. It
creates project notes when a project is open (global otherwise) and, in read-only
modes (Plan), it can read but not write.

## The panel

- Header **`+`** (`HeaderActionButton` id `notes.new-note`) creates a note and
  selects it.
- A **list** (by update time) on top and an inline **editor** below, with a
  **config bar** above the editor: the **scope** selector (Global / This project
  only) and the three **AI** toggles (read / edit / delete).
- Each row has a **delete** (trash) action on hover.
- Empty state offers a "New note" button.

## Limits

- Notes are **local to the app** (localStorage), not synced to any account.
  Project notes are scoped by path, not stored in the repo.
- Plain text only: no markdown rendering, tags, search or folders.
- The store is renderer-only; it does not touch disk.
- The AI cannot change a note's own permissions or scope — only the user can, from
  the panel.

## Next steps

- [Panels & features](README.md) — the other built-in panels.
- [AI tools](../chat/tools.md) — the `notes` tool and the rest of the catalogue.

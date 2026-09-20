import { useCallback, useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { HeaderActionButton, usePanelTitle } from '@features/layout'
import {
  createNote,
  deleteNote,
  listNotes,
  noteTitle,
  subscribeToNotes,
  updateNote,
  type Note
} from '@services/notes'
import styles from './NotePanel.module.css'

function formatDate(epochMs: number): string {
  const date = new Date(epochMs)
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Panel de notas — historial REAL del store: botón + en el header (como el
 * chat), lista por actualización y editor inline con eliminar. Solo aporta
 * su contenido; el frame lo maneja el sistema de layouts.
 */
export function NotePanel(): JSX.Element {
  const { setTitle, setActions } = usePanelTitle()
  const [notes, setNotes] = useState<Note[]>(() => listNotes())
  const [activeId, setActiveId] = useState<string | null>(() => listNotes()[0]?.id ?? null)

  useEffect(() => {
    setTitle('Notas')
  }, [setTitle])

  useEffect(() => subscribeToNotes(() => setNotes(listNotes())), [])

  const handleNewNote = useCallback((): void => {
    const note = createNote()
    setActiveId(note.id)
  }, [])

  // Botón + del header (como el del chat): crea y selecciona. Arrastrable:
  // cuando el panel sume más acciones, el usuario ordena a gusto.
  useEffect(() => {
    setActions(() => (
      <HeaderActionButton
        id="notes.new-note"
        label="Nueva nota"
        icon="plus"
        size="sm"
        onClick={handleNewNote}
      />
    ))
    return () => setActions(null)
  }, [setActions, handleNewNote])

  // Si la activa se eliminó en otro lado, caer a la primera.
  useEffect(() => {
    if (activeId !== null && !notes.some((n) => n.id === activeId)) {
      setActiveId(notes[0]?.id ?? null)
    }
  }, [notes, activeId])

  const active = activeId ? (notes.find((n) => n.id === activeId) ?? null) : null

  const handleDelete = useCallback(
    (id: string): void => {
      const remaining = notes.filter((n) => n.id !== id)
      deleteNote(id)
      if (id === activeId) setActiveId(remaining[0]?.id ?? null)
    },
    [notes, activeId]
  )

  return (
    <div className={styles.notes}>
      {notes.length === 0 ? (
        <div className={styles.placeholder}>
          <ProductIcon id="note" size={24} className={styles.icon} aria-hidden="true" />
          <p className={styles.empty}>Sin notas todavía.</p>
          <button type="button" className={styles.create} onClick={handleNewNote}>
            <ProductIcon id="plus" size={14} />
            Nueva nota
          </button>
        </div>
      ) : (
        <>
          <nav className={styles.list} aria-label="Historial de notas">
            {notes.map((note) => {
              const selected = note.id === activeId
              return (
                <button
                  key={note.id}
                  type="button"
                  className={[styles.row, selected ? styles.rowActive : null]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={selected}
                  onClick={() => setActiveId(note.id)}
                  title={noteTitle(note.content)}
                >
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{noteTitle(note.content)}</span>
                    <span className={styles.rowMeta}>{formatDate(note.updatedAt)}</span>
                  </span>
                  <span
                    role="button"
                    aria-label={`Eliminar ${noteTitle(note.content)}`}
                    className={styles.rowDelete}
                    data-drag-ignore=""
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDelete(note.id)
                    }}
                  >
                    <ProductIcon id="trash" size={12} aria-hidden="true" />
                  </span>
                </button>
              )
            })}
          </nav>
          {active ? (
            <div className={styles.editor}>
              <textarea
                key={active.id}
                className={styles.editorInput}
                defaultValue={active.content}
                placeholder="Escribe tu nota…"
                aria-label="Contenido de la nota"
                spellCheck={false}
                onChange={(event) => updateNote(active.id, event.target.value)}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useCallback, useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { SegmentedTabs, ToggleSwitch } from '@ui'
import { HeaderActionButton, usePanelTitle } from '@features/layout'
import {
  createNote,
  deleteNote,
  listVisibleNotes,
  noteTitle,
  setNoteConfig,
  subscribeToNotes,
  updateNote,
  type Note,
  type NoteScope
} from '@services/notes'
import styles from './NotePanel.module.css'

import { t } from '@core/i18n'

/** Root del proyecto abierto (`null` si no hay ninguno). */
function currentProjectRoot(): string | null {
  try {
    return localStorage.getItem('scrakk-studio:root-path') || null
  } catch {
    return null
  }
}

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
 * chat), lista por actualización y editor inline con eliminar. Además, cada
 * nota tiene su CONFIG: ámbito (global vs proyecto) y qué puede hacer la IA
 * (leer/editar/eliminar). Solo aporta su contenido; el frame lo maneja el
 * sistema de layouts.
 */
export function NotePanel(): JSX.Element {
  const { setTitle, setActions } = usePanelTitle()
  const projectRoot = currentProjectRoot()
  const [notes, setNotes] = useState<Note[]>(() => listVisibleNotes(projectRoot))
  const [activeId, setActiveId] = useState<string | null>(
    () => listVisibleNotes(projectRoot)[0]?.id ?? null
  )

  useEffect(() => {
    setTitle(t('layout.panel.notes'))
  }, [setTitle])

  useEffect(() => subscribeToNotes(() => setNotes(listVisibleNotes(projectRoot))), [projectRoot])

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
        label={t('layout.nueva.nota')}
        icon="plus"
        size="sm"
        onClick={handleNewNote}
      />
    ))
    return () => setActions(null)
  }, [setActions, handleNewNote])

  // Si la activa se eliminó en otro lado (o dejó de ser visible), caer a la primera.
  useEffect(() => {
    if (activeId !== null && !notes.some((n) => n.id === activeId)) {
      setActiveId(notes[0]?.id ?? null)
    }
  }, [notes, activeId])

  const active = activeId ? (notes.find((n) => n.id === activeId) ?? null) : null

  // Ámbito: el proyecto solo se ofrece si hay uno abierto (no se puede poseer
  // una nota de proyecto sin proyecto).
  const scopeItems = [
    { id: 'global', label: t('layout.ambito.global') },
    ...(projectRoot ? [{ id: 'project', label: t('layout.ambito.del.proyecto') }] : [])
  ]

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
          <p className={styles.empty}>{t('layout.sin.notas.todavia')}</p>
          <button type="button" className={styles.create} onClick={handleNewNote}>
            <ProductIcon id="plus" size={14} />
            {t('layout.nueva.nota')}
          </button>
        </div>
      ) : (
        <>
          <nav className={styles.list} aria-label={t('layout.historial.de.notas')}>
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
              <div className={styles.config}>
                <div className={styles.configField}>
                  <span className={styles.configLabel}>{t('layout.ambito.de.la.nota')}</span>
                  <SegmentedTabs
                    items={scopeItems}
                    activeId={active.scope}
                    onChange={(id) =>
                      setNoteConfig(active.id, {
                        scope: id as NoteScope,
                        projectRoot: id === 'project' ? projectRoot : null
                      })
                    }
                    ariaLabel={t('layout.ambito.de.la.nota')}
                  />
                </div>
                <div className={styles.configField}>
                  <span className={styles.configLabel}>{t('layout.acceso.de.la.ia')}</span>
                  <div className={styles.switchList}>
                    <div className={styles.switchRow}>
                      <span className={styles.switchLabel}>{t('layout.leer')}</span>
                      <ToggleSwitch
                        checked={active.ai.read}
                        onChange={(value) => setNoteConfig(active.id, { ai: { read: value } })}
                        label={t('layout.ia.puede.leer')}
                      />
                    </div>
                    <div className={styles.switchRow}>
                      <span className={styles.switchLabel}>{t('layout.editar')}</span>
                      <ToggleSwitch
                        checked={active.ai.edit}
                        onChange={(value) => setNoteConfig(active.id, { ai: { edit: value } })}
                        label={t('layout.ia.puede.editar')}
                      />
                    </div>
                    <div className={styles.switchRow}>
                      <span className={styles.switchLabel}>{t('layout.eliminar')}</span>
                      <ToggleSwitch
                        checked={active.ai.delete}
                        onChange={(value) => setNoteConfig(active.id, { ai: { delete: value } })}
                        label={t('layout.ia.puede.eliminar')}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <textarea
                key={active.id}
                className={styles.editorInput}
                defaultValue={active.content}
                placeholder={t('layout.escribe.tu.nota')}
                aria-label={t('layout.contenido.de.la.nota')}
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

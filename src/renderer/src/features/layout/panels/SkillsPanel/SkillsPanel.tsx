// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { IconButton, type ContextMenuItem } from '@ui'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import {
  skillRegistry,
  installSkill,
  removeSkill,
  type SkillInfo
} from '@services/skills'
import { insertSkillIntoChat } from '@services/chat'
import { showModal } from '@services/modals'
import styles from './SkillsPanel.module.css'

const SOURCE_LABEL: Record<SkillInfo['source'], string> = {
  project: 'proyecto',
  user: 'usuario',
  extension: 'extensión'
}

/**
 * Panel de skills del chat (NO es extensión): la vista que el ChatPanel monta
 * adentro suyo cuando se toca "skills: N" debajo del input.
 *
 * Lista, crea, borra e inserta skills usando las APIs públicas del servicio
 * de skills y del chat. Escribe archivos reales en `.scrakk/skills`.
 */
export function SkillsPanel(): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>(() => skillRegistry.list())
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [scope, setScope] = useState<'project' | 'user'>('project')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  /** El formulario de creación aparece al pulsar "Nueva". */
  const [creating, setCreating] = useState(false)
  /** Foco del nombre al abrir el formulario. */
  const nameRef = useRef<HTMLInputElement>(null)
  /** Timer del auto-ocultado del log. */
  const logTimer = useRef<number | null>(null)
  /** Texto del log (se conserva mientras colapsa) + si es error. */
  const [log, setLog] = useState<{ text: string; error: boolean } | null>(null)
  /** Visibilidad del log: al apagarse, la altura se colapsa suave. */
  const [logOpen, setLogOpen] = useState(false)

  useEffect(() => {
    skillRegistry.start()
    return skillRegistry.subscribe(() => setSkills(skillRegistry.list()))
  }, [])

  // Al abrir el formulario, el foco va al nombre.
  useEffect(() => {
    if (creating) nameRef.current?.focus()
  }, [creating])

  // Log (estado de éxito o error): el texto se queda, se desvanece en 3s y
  // RECIÉN ahí la altura se colapsa suave (sin saltos de layout).
  const logMessage = error ?? status
  useEffect(() => {
    if (!logMessage) return undefined
    setLog({ text: logMessage, error: error !== null })
    setLogOpen(true)
    logTimer.current = window.setTimeout(() => {
      logTimer.current = null
      setLogOpen(false)
      setStatus(null)
      setError(null)
    }, 3000)
    return () => {
      if (logTimer.current !== null) {
        window.clearTimeout(logTimer.current)
        logTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logMessage])

  const canSave = name.trim().length > 0 && description.trim().length > 0 && !busy

  /** Refresca la lista de skills (re-descubre el registry). */
  const reload = (): void => {
    setStatus(null)
    setError(null)
    skillRegistry.start()
  }

  /** Abre el formulario de creación (la altura la anima el CSS). */
  const openComposer = (): void => {
    setStatus(null)
    setError(null)
    setCreating(true)
  }

  /** Cierra el formulario: el colapso (150ms) lo anima el CSS. */
  const closeComposer = (): void => {
    setCreating(false)
  }

  /** Menú contextual global para elegir dónde guardar. */
  const openScopeMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const items: ContextMenuItem[] = [
      { label: 'Proyecto (.scrakk/skills)', checked: scope === 'project', onClick: () => setScope('project') },
      { label: 'Usuario (~/.scrakk/skills)', checked: scope === 'user', onClick: () => setScope('user') }
    ]
    showContextMenu(rect.left, rect.bottom, items)
  }

  const handleSave = async (): Promise<void> => {
    if (!canSave) return
    setBusy(true)
    setError(null)
    setStatus(null)
    const result = await installSkill({
      name: name.trim(),
      description: description.trim(),
      body,
      scope
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar la skill')
      return
    }
    setName('')
    setDescription('')
    setBody('')
    closeComposer()
    setStatus('Skill guardada')
  }

  const handleInsert = async (skill: SkillInfo): Promise<void> => {
    setError(null)
    setStatus(null)
    const result = await insertSkillIntoChat(skill.name)
    if (!result.ok) {
      setError(result.error ?? 'No se pudo insertar la skill')
      return
    }
    setStatus(`"${skill.name}" insertada en el chat`)
  }

  const handleDelete = async (skill: SkillInfo): Promise<void> => {
    if (skill.source === 'extension') return
    setError(null)
    setStatus(null)
    const result = await removeSkill(skill.name, skill.source)
    if (!result.ok) setError(result.error ?? 'No se pudo borrar la skill')
  }

  /** Pide confirmación (modal global) antes de borrar una skill. */
  const requestDelete = (skill: SkillInfo): void => {
    showModal({
      title: 'Eliminar skill',
      render: ({ close }) => (
        <div className={styles.confirm}>
          <p className={styles.confirmText}>
            ¿Eliminar &quot;{skill.name}&quot;? Esta acción no se puede deshacer.
          </p>
          <div className={styles.confirmActions}>
            <button type="button" className={styles.confirmCancel} onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className={styles.confirmDelete}
              onClick={() => {
                close()
                void handleDelete(skill)
              }}
            >
              Eliminar
            </button>
          </div>
        </div>
      )
    })
  }

  // Acciones de la barra (declarativas): la segunda cambia según el estado.
  const barActions: Array<{
    id: string
    label: string
    icon: string
    primary?: boolean
    onClick: () => void
  }> = [
    { id: 'new', label: 'Nueva', icon: 'plus', primary: true, onClick: openComposer },
    creating
      ? { id: 'close', label: 'Cerrar', icon: 'close', onClick: closeComposer }
      : { id: 'reload', label: 'Recargar', icon: 'refresh', onClick: reload }
  ]

  return (
    <div className={styles.panel}>
      {/* Barra de acciones: crear una skill nueva; recargar (o cerrar) la lista. */}
      <div className={styles.actionsBar}>
        {barActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={
              action.primary ? `${styles.actionBtn} ${styles.actionBtnPrimary}` : styles.actionBtn
            }
            data-active={action.primary && creating ? '' : undefined}
            aria-expanded={action.primary ? creating : undefined}
            onClick={action.onClick}
          >
            <ProductIcon id={action.icon} size={14} aria-hidden="true" />
            {action.label}
          </button>
        ))}
      </div>

      {/* Formulario: SIEMPRE montado; la altura se expande/colapsa con CSS
          (grid-template-rows), así el contenido de abajo se mueve suave y sin
          saltos. Cuando está cerrado queda `inert`. */}
      <div className={styles.formReveal} data-open={creating ? '' : undefined} inert={!creating}>
        <div className={styles.revealClip}>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <div className={styles.fields}>
              <input
                ref={nameRef}
                className={styles.field}
                value={name}
                placeholder="nombre (ej. release-notes)"
                spellCheck={false}
                onChange={(event) => setName(event.target.value)}
              />
              <input
                className={styles.field}
                value={description}
                placeholder="descripción: cuándo usarla"
                onChange={(event) => setDescription(event.target.value)}
              />
              <textarea
                className={styles.body}
                value={body}
                placeholder="Instrucciones (markdown)…"
                rows={4}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
            <div className={styles.formFooter}>
              <button
                type="button"
                className={styles.scope}
                aria-haspopup="menu"
                onClick={openScopeMenu}
              >
                <span className={styles.scopeLabel}>
                  {scope === 'project' ? 'Proyecto' : 'Usuario'}
                </span>
                <ProductIcon id="chevron-down" size={12} aria-hidden="true" />
              </button>
              <div className={styles.formSpacer} aria-hidden="true" />
              <IconButton
                type="submit"
                variant="accent"
                shape="rounded"
                size="sm"
                label={busy ? 'Guardando…' : 'Guardar skill'}
                disabled={!canSave}
              >
                <ProductIcon id="check" size={14} aria-hidden="true" />
              </IconButton>
            </div>
          </form>
        </div>
      </div>

      {/* Log: mismo patrón. El texto se va con fade y RECIÉN ahí la altura se
          colapsa suave (sin que "todo" salte hacia arriba). */}
      <div className={styles.logReveal} data-open={logOpen ? '' : undefined}>
        <div className={styles.revealClip}>
          {log ? (
            <span
              key={log.text}
              className={log.error ? `${styles.log} ${styles.logError}` : styles.log}
            >
              {log.text}
            </span>
          ) : null}
        </div>
      </div>

      {skills.length > 0 ? (
        <p className={styles.counter}>
          Tienes {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
        </p>
      ) : null}

      {/* Lista de skills. */}
      {skills.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Todavía no hay skills.</p>
        </div>
      ) : (
        <div className={styles.list} role="list">
          {skills.map((skill) => (
            <div
              key={`${skill.source}:${skill.name}`}
              className={styles.row}
              role="listitem"
              title={skill.description || skill.path}
            >
              <span className={styles.rowName}>{skill.name}</span>
              <span className={styles.badge}>{SOURCE_LABEL[skill.source]}</span>
              <div className={styles.rowActions}>
                <IconButton
                  type="button"
                  size="sm"
                  shape="rounded"
                  label={`Insertar ${skill.name} en el chat`}
                  onClick={() => void handleInsert(skill)}
                >
                  <ProductIcon id="chat" size={13} aria-hidden="true" />
                </IconButton>
                {skill.source !== 'extension' ? (
                  <IconButton
                    type="button"
                    size="sm"
                    shape="rounded"
                    label={`Borrar ${skill.name}`}
                    onClick={() => requestDelete(skill)}
                  >
                    <ProductIcon id="trash" size={13} aria-hidden="true" />
                  </IconButton>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

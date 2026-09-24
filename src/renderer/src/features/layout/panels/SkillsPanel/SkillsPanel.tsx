// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import type { ContextMenuItem } from '@ui'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import {
  skillRegistry,
  installSkill,
  removeSkill,
  type SkillInfo
} from '@services/skills'
import { insertSkillIntoChat } from '@services/chat'
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

  useEffect(() => {
    skillRegistry.start()
    return skillRegistry.subscribe(() => setSkills(skillRegistry.list()))
  }, [])

  const canSave = name.trim().length > 0 && description.trim().length > 0 && !busy

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

  return (
    <div className={styles.panel}>
      <section className={styles.form}>
        <span className={styles.title}>Nueva skill</span>
        <input
          className={styles.input}
          value={name}
          placeholder="nombre (ej. release-notes)"
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className={styles.input}
          value={description}
          placeholder="descripción: cuándo usarla"
          onChange={(event) => setDescription(event.target.value)}
        />
        <textarea
          className={styles.textarea}
          value={body}
          placeholder="Instrucciones (markdown)."
          rows={5}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className={styles.formRow}>
          <button
            type="button"
            className={styles.select}
            aria-haspopup="menu"
            onClick={openScopeMenu}
          >
            <span className={styles.selectLabel}>
              {scope === 'project' ? 'Proyecto (.scrakk/skills)' : 'Usuario (~/.scrakk/skills)'}
            </span>
            <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
          </button>
          <button type="button" className={styles.saveBtn} disabled={!canSave} onClick={handleSave}>
            <ProductIcon id="check" size={13} aria-hidden="true" />
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        {status ? <span className={styles.status}>{status}</span> : null}
        {error ? <span className={styles.error}>{error}</span> : null}
      </section>

      <section className={styles.listSection}>
        <span className={styles.title}>
          Skills {skills.length > 0 ? <span className={styles.count}>{skills.length}</span> : null}
        </span>
        {skills.length === 0 ? (
          <span className={styles.empty}>Todavía no hay skills.</span>
        ) : (
          <ul className={styles.list}>
            {skills.map((skill) => (
              <li key={`${skill.source}:${skill.name}`} className={styles.item}>
                <div className={styles.itemMain}>
                  <span className={styles.itemName}>
                    {skill.name}
                    <span className={styles.badge}>{SOURCE_LABEL[skill.source]}</span>
                  </span>
                  <span className={styles.itemDesc}>{skill.description || skill.path}</span>
                </div>
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Insertar en el chat"
                    aria-label={`Insertar ${skill.name} en el chat`}
                    onClick={() => void handleInsert(skill)}
                  >
                    <ProductIcon id="chat" size={13} aria-hidden="true" />
                  </button>
                  {skill.source !== 'extension' ? (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Borrar"
                      aria-label={`Borrar ${skill.name}`}
                      onClick={() => void handleDelete(skill)}
                    >
                      <ProductIcon id="trash" size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

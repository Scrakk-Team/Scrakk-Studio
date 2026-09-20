/**
 * Sección "Modos" (Ajustes → Chat) — modos de aprobación propios.
 *
 * Cada modo propio parte de un preset integrado y solo cambia lo que el
 * usuario toca (ediciones, shell, confirmaciones y herramientas). Se guardan
 * en `.scrakk/modes.json` (proyecto y usuario).
 */

import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { ToggleSwitch } from '@ui'
import type { ContextMenuItem } from '@ui'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { scrakkProjectRoot, type ScrakkScope } from '@services/scrakk'
import {
  loadModeSettings,
  readCustomModes,
  slugifyModeId,
  writeCustomModes,
  type CustomModeEntry,
  type ModeOverrides
} from '@services/ai/policy/modeSettings'
import { modeRegistry } from '@services/ai/policy/modeRegistry'
import { getPromptForMode } from '@services/ai/prompts/modes'
import { registry } from '@services/ai/tools'
import { toolSettingsService } from '@services/ai/toolSettings'
import styles from './ChatSections.module.css'

const MAX_TOOL_OPTIONS = 40
const BUILTIN_BASE_IDS = ['default', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions']
const COLORS = ['#6366f1', '#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ef4444', '#14b8a6']

type BehaviorChoice = 'always' | 'auto' | 'never'
type PromptChoice = 'ask' | 'deny' | 'auto'

const BEHAVIOR_LABEL: Record<BehaviorChoice, string> = {
  always: 'Permitir',
  auto: 'Preguntar',
  never: 'Bloquear'
}

const PROMPT_LABEL: Record<PromptChoice, string> = {
  ask: 'Preguntar',
  deny: 'Negar en silencio',
  auto: 'Decidir solo'
}

function emptyDraft(base = 'default'): CustomModeEntry {
  const baseMode = modeRegistry.get(base)
  return {
    id: '',
    label: '',
    description: '',
    color: baseMode?.color ?? COLORS[0],
    base,
    overrides: {
      mutationBehavior: baseMode?.mutationBehavior ?? 'auto',
      shellBehavior: baseMode?.shellBehavior ?? 'auto',
      promptPolicy: baseMode?.promptPolicy ?? 'ask'
    },
    prompt: getPromptForMode(base)
  }
}

function toolOptions(): Array<{ name: string; label: string }> {
  const meta = toolSettingsService.getAllMeta()
  return registry
    .getNames()
    .slice(0, MAX_TOOL_OPTIONS)
    .map((name) => ({ name, label: meta[name]?.label ?? name }))
}

export function ModesSection(): JSX.Element {
  const [scope, setScope] = useState<ScrakkScope>('project')
  const [entries, setEntries] = useState<CustomModeEntry[]>([])
  const [draft, setDraft] = useState<CustomModeEntry | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const builtins = BUILTIN_BASE_IDS.map((id) => modeRegistry.get(id)).filter(
    (mode): mode is NonNullable<typeof mode> => mode !== undefined
  )
  const tools = toolOptions()

  useEffect(() => {
    let alive = true
    void (async () => {
      const list = await readCustomModes(scope).catch(() => [])
      if (!alive) return
      setEntries(list)
      setDraft(null)
      setEditingId(null)
      setStatus(null)
      setError(null)
    })()
    return () => {
      alive = false
    }
  }, [scope])

  const openSelect = (event: MouseEvent<HTMLButtonElement>, items: ContextMenuItem[]): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom, items)
  }

  const update = (patch: Partial<CustomModeEntry>): void => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const updateOverrides = (patch: Partial<ModeOverrides>): void => {
    setDraft((prev) => (prev ? { ...prev, overrides: { ...prev.overrides, ...patch } } : prev))
  }

  const changeBase = (base: string): void => {
    setDraft((prev) => {
      if (!prev) return prev
      const baseMode = modeRegistry.get(base)
      const prompt = prev.prompt?.trim() ? prev.prompt : getPromptForMode(base)
      return {
        ...prev,
        base,
        prompt,
        overrides: {
          ...prev.overrides,
          // Cambiar de base reaplica su preset; solo se conserva el filtro de tools.
          mutationBehavior: baseMode?.mutationBehavior ?? 'auto',
          shellBehavior: baseMode?.shellBehavior ?? 'auto',
          promptPolicy: baseMode?.promptPolicy ?? 'ask',
          acceptEdits: baseMode?.acceptEdits,
          bypassPermissions: baseMode?.bypassPermissions,
          toolFilter: prev.overrides?.toolFilter
        }
      }
    })
  }

  const isToolEnabled = (name: string): boolean =>
    !(draft?.overrides?.toolFilter?.exclude ?? []).includes(name)

  const toggleTool = (name: string, enabled: boolean): void => {
    setDraft((prev) => {
      if (!prev) return prev
      const current = new Set(prev.overrides?.toolFilter?.exclude ?? [])
      if (enabled) current.delete(name)
      else current.add(name)
      const exclude = tools.map((tool) => tool.name).filter((tool) => current.has(tool))
      return {
        ...prev,
        overrides: {
          ...prev.overrides,
          toolFilter: exclude.length > 0 ? { exclude } : undefined
        }
      }
    })
  }

  const startCreate = (base = 'default'): void => {
    setDraft(emptyDraft(base))
    setEditingId(null)
    setStatus(null)
    setError(null)
  }

  const startEdit = (entry: CustomModeEntry): void => {
    setDraft({ ...entry, overrides: { ...entry.overrides } })
    setEditingId(entry.id)
    setStatus(null)
    setError(null)
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    const label = draft.label.trim()
    if (!label) {
      setError('Ponle un nombre al modo.')
      return
    }
    let id = editingId ?? slugifyModeId(label)
    if (!id) {
      setError('El nombre no genera un id válido.')
      return
    }
    if (BUILTIN_BASE_IDS.includes(id)) id = `custom-${id}`
    if (!editingId && entries.some((entry) => entry.id === id)) {
      let suffix = 2
      while (entries.some((entry) => entry.id === `${id}-${suffix}`)) suffix++
      id = `${id}-${suffix}`
    }

    const entry: CustomModeEntry = { ...draft, id, label }
    const next = editingId
      ? entries.map((current) => (current.id === editingId ? entry : current))
      : [...entries, entry]

    const ok = await writeCustomModes(scope, next)
    if (!ok) {
      setError('No se pudo guardar modes.json')
      return
    }
    await loadModeSettings()
    setEntries(next)
    setDraft(null)
    setEditingId(null)
    setStatus('Guardado')
    setError(null)
  }

  const remove = async (id: string): Promise<void> => {
    const next = entries.filter((entry) => entry.id !== id)
    const ok = await writeCustomModes(scope, next)
    if (!ok) {
      setError('No se pudo guardar modes.json')
      return
    }
    await loadModeSettings()
    setEntries(next)
    if (editingId === id) {
      setDraft(null)
      setEditingId(null)
    }
  }

  const labelOf = (id: string): string => modeRegistry.get(id)?.label ?? id

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        Crea modos propios a partir de uno integrado.
      </p>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.select}
          aria-haspopup="menu"
          onClick={(event) =>
            openSelect(event, [
              {
                label: 'Proyecto',
                checked: scope === 'project',
                onClick: () => setScope('project')
              },
              {
                label: 'Usuario',
                checked: scope === 'user',
                onClick: () => setScope('user')
              }
            ])
          }
        >
          <span className={styles.selectLabel}>
            {scope === 'project' ? 'Proyecto' : 'Usuario'}
          </span>
          <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
        </button>
        <button type="button" className={styles.saveBtn} onClick={() => startCreate()}>
          <ProductIcon id="plus" size={12} />
          Nuevo modo
        </button>
      </div>

      {scope === 'project' && !scrakkProjectRoot() ? (
        <p className={styles.empty}>No hay proyecto abierto: usa la capa de usuario.</p>
      ) : null}

      <div className={styles.group}>
        <span className={styles.groupLabel}>Tus modos</span>
        {entries.length === 0 ? (
          <span className={styles.rowDesc}>Todavía no creaste ninguno.</span>
        ) : (
          <div className={styles.list}>
            {entries.map((entry) => (
              <div key={entry.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: entry.color ?? '#888'
                      }}
                    />
                    {entry.label}
                  </span>
                  <span className={styles.rowDesc}>
                    {entry.description || `Basado en ${labelOf(entry.base ?? 'default')}`}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.rowAction}
                  onClick={() => startEdit(entry)}
                  aria-label={`Editar ${entry.label}`}
                >
                  <ProductIcon id="pencil" size={12} />
                </button>
                <button
                  type="button"
                  className={styles.rowAction}
                  onClick={() => void remove(entry.id)}
                  aria-label={`Borrar ${entry.label}`}
                >
                  <ProductIcon id="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {draft ? (
        <div className={styles.editor}>
          <span className={styles.groupLabel}>
            {editingId ? 'Editar modo' : 'Nuevo modo'}
          </span>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Nombre</span>
            <input
              className={styles.input}
              value={draft.label}
              placeholder="Shell segura"
              onChange={(event) => update({ label: event.target.value })}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Descripción</span>
            <input
              className={styles.input}
              value={draft.description ?? ''}
              placeholder="Para qué sirve este modo"
              onChange={(event) => update({ description: event.target.value })}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Parte de</span>
            <button
              type="button"
              className={styles.select}
              aria-haspopup="menu"
              onClick={(event) =>
                openSelect(
                  event,
                  builtins.map((mode) => ({
                    label: mode.label,
                    checked: (draft.base ?? 'default') === mode.id,
                    onClick: () => changeBase(mode.id)
                  }))
                )
              }
            >
              <span className={styles.selectLabel}>{labelOf(draft.base ?? 'default')}</span>
              <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
            </button>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Color</span>
            <div className={styles.swatches}>
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.swatch} ${draft.color === color ? styles.swatchActive : ''}`}
                  style={{ background: color }}
                  aria-label={`Color ${color}`}
                  onClick={() => update({ color })}
                />
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Ediciones de archivos</span>
            <button
              type="button"
              className={styles.select}
              aria-haspopup="menu"
              onClick={(event) =>
                openSelect(
                  event,
                  (['always', 'auto', 'never'] as BehaviorChoice[]).map((value) => ({
                    label: BEHAVIOR_LABEL[value],
                    checked: (draft.overrides?.mutationBehavior ?? 'auto') === value,
                    onClick: () =>
                      updateOverrides({ mutationBehavior: value, bypassPermissions: false })
                  }))
                )
              }
            >
              <span className={styles.selectLabel}>
                {BEHAVIOR_LABEL[draft.overrides?.mutationBehavior ?? 'auto']}
              </span>
              <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
            </button>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Comandos de shell</span>
            <button
              type="button"
              className={styles.select}
              aria-haspopup="menu"
              onClick={(event) =>
                openSelect(
                  event,
                  (['always', 'auto', 'never'] as BehaviorChoice[]).map((value) => ({
                    label: BEHAVIOR_LABEL[value],
                    checked: (draft.overrides?.shellBehavior ?? 'auto') === value,
                    onClick: () =>
                      updateOverrides({ shellBehavior: value, bypassPermissions: false })
                  }))
                )
              }
            >
              <span className={styles.selectLabel}>
                {BEHAVIOR_LABEL[draft.overrides?.shellBehavior ?? 'auto']}
              </span>
              <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
            </button>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Cuando algo pida confirmación</span>
            <button
              type="button"
              className={styles.select}
              aria-haspopup="menu"
              onClick={(event) =>
                openSelect(
                  event,
                  (['ask', 'deny', 'auto'] as PromptChoice[]).map((value) => ({
                    label: PROMPT_LABEL[value],
                    checked: (draft.overrides?.promptPolicy ?? 'ask') === value,
                    onClick: () => updateOverrides({ promptPolicy: value })
                  }))
                )
              }
            >
              <span className={styles.selectLabel}>
                {PROMPT_LABEL[draft.overrides?.promptPolicy ?? 'ask']}
              </span>
              <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
            </button>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Herramientas habilitadas en este modo</span>
            <div className={styles.list}>
              {tools.map((tool) => (
                <div key={tool.name} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{tool.label}</span>
                    <span className={styles.rowDesc}>{tool.name}</span>
                  </div>
                  <ToggleSwitch
                    checked={isToolEnabled(tool.name)}
                    onChange={(next) => toggleTool(tool.name, next)}
                    label={`Habilitar ${tool.label} en este modo`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Prompt (opcional)</span>
            <textarea
              className={styles.textarea}
              value={draft.prompt ?? ''}
              placeholder="Instrucciones extra para el modelo en este modo"
              onChange={(event) => update({ prompt: event.target.value })}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.saveBtn} onClick={() => void save()}>
              <ProductIcon id="check" size={12} />
              Guardar modo
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setDraft(null)
                setEditingId(null)
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.group}>
        <span className={styles.groupLabel}>Modos integrados</span>
        <div className={styles.list}>
          {builtins.map((mode) => (
            <div key={mode.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: mode.color ?? '#888'
                    }}
                  />
                  {mode.label}
                </span>
                <span className={styles.rowDesc}>{mode.description}</span>
              </div>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => startCreate(mode.id)}
              >
                Duplicar
              </button>
            </div>
          ))}
        </div>
      </div>

      {status ? <span className={styles.status}>{status}</span> : null}
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  )
}

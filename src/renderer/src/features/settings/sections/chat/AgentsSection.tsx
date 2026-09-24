// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Agentes" (Ajustes → Chat) — sistema unificado.
 *
 * Dos tabs internas (API global `SegmentedTabs`):
 *   - Primarios: los que antes eran "Modos" (el agente activo del chat).
 *   - Subagentes: reusables, invocables por la tool `task` o `@nombre`.
 *
 * Se guardan en `.scrakk/agents/primary.json` y `subagents.json` (user y
 * proyecto). Comparten schema: prompt, permisos, tools y modelo.
 */

import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { SegmentedTabs, ToggleSwitch } from '@ui'
import type { ContextMenuItem } from '@ui'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { scrakkProjectRoot, type ScrakkScope } from '@services/scrakk'
import { modeRegistry } from '@services/ai/policy/modeRegistry'
import { slugifyModeId } from '@services/ai/policy/modeSettings'
import { registry } from '@services/ai/tools'
import { toolSettingsService } from '@services/ai/toolSettings'
import {
  AGENT_MODEL_INHERIT,
  agentRegistry,
  loadAgentSettings,
  readAgentEntries,
  writeAgentEntries,
  type AgentEntry,
  type AgentKind
} from '@services/ai/agents'
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

function emptyDraft(kind: AgentKind): AgentEntry {
  const base = modeRegistry.get('default')
  return {
    id: '',
    label: '',
    description: '',
    color: base?.color ?? COLORS[0],
    mode: kind,
    base: 'default',
    model: AGENT_MODEL_INHERIT,
    overrides: {
      mutationBehavior: base?.mutationBehavior ?? 'auto',
      shellBehavior: base?.shellBehavior ?? 'auto',
      promptPolicy: base?.promptPolicy ?? 'ask'
    },
    prompt: '',
    subagents: kind === 'primary' ? [] : undefined
  }
}

function toolOptions(): Array<{ name: string; label: string }> {
  const meta = toolSettingsService.getAllMeta()
  return registry
    .getNames()
    .filter((name) => name !== 'task')
    .slice(0, MAX_TOOL_OPTIONS)
    .map((name) => ({ name, label: meta[name]?.label ?? name }))
}

export function AgentsSection(): JSX.Element {
  const [scope, setScope] = useState<ScrakkScope>('project')
  const [kind, setKind] = useState<AgentKind>('primary')
  const [entries, setEntries] = useState<AgentEntry[]>([])
  const [draft, setDraft] = useState<AgentEntry | null>(null)
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
      const list = await readAgentEntries(scope, kind).catch(() => [])
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
  }, [scope, kind])

  const openSelect = (event: MouseEvent<HTMLButtonElement>, items: ContextMenuItem[]): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom, items)
  }

  const update = (patch: Partial<AgentEntry>): void => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const updateOverrides = (patch: Partial<NonNullable<AgentEntry['overrides']>>): void => {
    setDraft((prev) => (prev ? { ...prev, overrides: { ...prev.overrides, ...patch } } : prev))
  }

  // Herramientas: el editor administra include/exclude de forma uniforme.
  const isToolEnabled = (name: string): boolean => {
    const include = draft?.tools?.include
    if (include) return include.includes(name)
    return !(draft?.tools?.exclude ?? []).includes(name)
  }

  const toggleTool = (name: string, enabled: boolean): void => {
    setDraft((prev) => {
      if (!prev) return prev
      const include = prev.tools?.include
      const exclude = new Set(prev.tools?.exclude ?? [])
      let nextInclude: string[] | undefined
      let nextExclude: string[] | undefined
      if (include) {
        const set = new Set(include)
        if (enabled) set.add(name)
        else set.delete(name)
        nextInclude = tools.map((tool) => tool.name).filter((tool) => set.has(tool))
      } else {
        if (enabled) exclude.delete(name)
        else exclude.add(name)
        nextExclude = tools.map((tool) => tool.name).filter((tool) => exclude.has(tool))
      }
      const next: NonNullable<AgentEntry['tools']> = {}
      if (nextInclude?.length) next.include = nextInclude
      if (nextExclude?.length) next.exclude = nextExclude
      return { ...prev, tools: next }
    })
  }

  const toggleSubagent = (id: string, enabled: boolean): void => {
    setDraft((prev) => {
      if (!prev) return prev
      const set = new Set(prev.subagents ?? [])
      if (enabled) set.add(id)
      else set.delete(id)
      return { ...prev, subagents: [...set] }
    })
  }

  const startCreate = (): void => {
    setDraft(emptyDraft(kind))
    setEditingId(null)
    setStatus(null)
    setError(null)
  }

  const startEdit = (entry: AgentEntry): void => {
    setDraft({ ...entry, tools: { ...entry.tools }, overrides: { ...entry.overrides } })
    setEditingId(entry.id)
    setStatus(null)
    setError(null)
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    const label = draft.label.trim()
    if (!label) {
      setError('Ponle un nombre al agente.')
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
      while (entries.some((entry) => entry.id === `${id}-${suffix}`)) suffix += 1
      id = `${id}-${suffix}`
    }

    const entry: AgentEntry = { ...draft, id, label, mode: kind }
    const next = editingId
      ? entries.map((current) => (current.id === editingId ? entry : current))
      : [...entries, entry]

    const ok = await writeAgentEntries(scope, kind, next)
    if (!ok) {
      setError(`No se pudo guardar ${kind === 'primary' ? 'primary.json' : 'subagents.json'}`)
      return
    }
    await loadAgentSettings()
    setEntries(next)
    setDraft(null)
    setEditingId(null)
    setStatus('Guardado')
    setError(null)
  }

  const remove = async (id: string): Promise<void> => {
    const next = entries.filter((entry) => entry.id !== id)
    const ok = await writeAgentEntries(scope, kind, next)
    if (!ok) {
      setError('No se pudo guardar')
      return
    }
    await loadAgentSettings()
    setEntries(next)
    if (editingId === id) {
      setDraft(null)
      setEditingId(null)
    }
  }

  const labelOfBase = (id: string): string => modeRegistry.get(id)?.label ?? id
  const availableSubagents = agentRegistry.listSubagents()

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        Perfiles de IA: prompt, permisos, herramientas y modelo. Los primarios
        son el agente activo del chat; los subagentes se invocan con la tool
        &nbsp;<code className={styles.code}>task</code> o escribiendo
        &nbsp;<code className={styles.code}>@nombre</code> en el input.
      </p>

      <SegmentedTabs
        ariaLabel="Tipo de agente"
        activeId={kind}
        onChange={(id) => setKind(id as AgentKind)}
        items={[
          { id: 'primary', label: 'Primarios' },
          { id: 'subagent', label: 'Subagentes' }
        ]}
      />

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.select}
          aria-haspopup="menu"
          onClick={(event) =>
            openSelect(event, [
              { label: 'Proyecto', checked: scope === 'project', onClick: () => setScope('project') },
              { label: 'Usuario', checked: scope === 'user', onClick: () => setScope('user') }
            ])
          }
        >
          <span className={styles.selectLabel}>
            {scope === 'project' ? 'Proyecto' : 'Usuario'}
          </span>
          <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
        </button>
        <button type="button" className={styles.saveBtn} onClick={startCreate}>
          <ProductIcon id="plus" size={12} />
          {kind === 'primary' ? 'Nuevo primario' : 'Nuevo subagente'}
        </button>
      </div>

      {scope === 'project' && !scrakkProjectRoot() ? (
        <p className={styles.empty}>No hay proyecto abierto: usa la capa de usuario.</p>
      ) : null}

      <div className={styles.group}>
        <span className={styles.groupLabel}>
          {kind === 'primary' ? 'Tus primarios' : 'Tus subagentes'}
        </span>
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
                    {entry.description || `Basado en ${labelOfBase(entry.base ?? 'default')}`}
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
            {editingId
              ? `Editar ${kind === 'primary' ? 'primario' : 'subagente'}`
              : kind === 'primary'
                ? 'Nuevo primario'
                : 'Nuevo subagente'}
          </span>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Nombre</span>
            <input
              className={styles.input}
              value={draft.label}
              placeholder={kind === 'primary' ? 'Asistente' : 'Explorador'}
              onChange={(event) => update({ label: event.target.value })}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Descripción</span>
            <input
              className={styles.input}
              value={draft.description ?? ''}
              placeholder="Para qué sirve este agente"
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
                    onClick: () => {
                      const baseMode = modeRegistry.get(mode.id)
                      update({
                        base: mode.id,
                        overrides: {
                          ...draft.overrides,
                          mutationBehavior: baseMode?.mutationBehavior ?? 'auto',
                          shellBehavior: baseMode?.shellBehavior ?? 'auto',
                          promptPolicy: baseMode?.promptPolicy ?? 'ask',
                          acceptEdits: baseMode?.acceptEdits,
                          bypassPermissions: baseMode?.bypassPermissions
                        }
                      })
                    }
                  }))
                )
              }
            >
              <span className={styles.selectLabel}>{labelOfBase(draft.base ?? 'default')}</span>
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
            <span className={styles.fieldLabel}>Modelo</span>
            <input
              className={styles.input}
              value={draft.model ?? AGENT_MODEL_INHERIT}
              placeholder={AGENT_MODEL_INHERIT}
              spellCheck={false}
              onChange={(event) => update({ model: event.target.value })}
            />
            <span className={styles.rowDesc}>
              {AGENT_MODEL_INHERIT} = hereda el modelo del chat activo.
            </span>
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
            <span className={styles.fieldLabel}>Herramientas</span>
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
                    label={`Habilitar ${tool.label}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {kind === 'primary' ? (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Subagentes permitidos</span>
              {availableSubagents.length === 0 ? (
                <span className={styles.rowDesc}>
                  Todavía no hay subagentes. Creá uno en la tab Subagentes.
                </span>
              ) : (
                <div className={styles.list}>
                  {availableSubagents.map((agent) => (
                    <div key={agent.id} className={styles.row}>
                      <div className={styles.rowMain}>
                        <span className={styles.rowTitle}>{agent.label}</span>
                        <span className={styles.rowDesc}>{agent.id}</span>
                      </div>
                      <ToggleSwitch
                        checked={(draft.subagents ?? []).includes(agent.id)}
                        onChange={(next) => toggleSubagent(agent.id, next)}
                        label={`Permitir ${agent.label}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Prompt</span>
            <textarea
              className={styles.textarea}
              value={draft.prompt ?? ''}
              placeholder="Instrucciones del agente"
              onChange={(event) => update({ prompt: event.target.value })}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.saveBtn} onClick={() => void save()}>
              <ProductIcon id="check" size={12} />
              Guardar agente
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

      {status ? <span className={styles.status}>{status}</span> : null}
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  )
}

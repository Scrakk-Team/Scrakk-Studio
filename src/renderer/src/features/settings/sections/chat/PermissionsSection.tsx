/**
 * Sección "Permisos" (Ajustes → Chat) — edita `.scrakk/permissions.json`.
 *
 * Reglas de permitir / preguntar / negar por herramienta, con alcance opcional
 * a ciertos modos. Al guardar se aplica al policy engine al instante y se
 * conserva el bloque `modeRules` (no lo pisa).
 */

import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import type { ContextMenuItem } from '@ui'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { scrakkHandle, scrakkProjectRoot, type ScrakkScope } from '@services/scrakk'
import {
  parseModeRules,
  parsePermissionLists,
  parsePermissionRule
} from '@services/ai/policy/permissionRules'
import { policyEngine } from '@services/ai/policy/policy-engine'
import { modeRegistry } from '@services/ai/policy/modeRegistry'
import { applyMode, getModeId } from '@services/ai/prompts/modes'
import styles from './ChatSections.module.css'

const FILE = 'permissions.json'
const ACTIONS = ['allow', 'ask', 'deny'] as const
type Action = (typeof ACTIONS)[number]

interface RuleRow {
  action: Action
  rule: string
  /** Vacío = todos los modos. */
  modes: string[]
}

type ModeLists = Record<Action, string[]>

const ACTION_LABEL: Record<Action, string> = {
  allow: 'Permitir',
  ask: 'Preguntar',
  deny: 'Negar'
}

const ALIAS_MODES = new Set(['auto_edit', 'all_allow'])

/** Plantillas para armar la regla sin conocer la sintaxis de memoria. */
const TOOL_TEMPLATES: Array<{ label: string; value: string }> = [
  { label: 'Comando de shell', value: 'Bash()' },
  { label: 'Leer archivos', value: 'Read()' },
  { label: 'Editar archivos', value: 'Edit()' },
  { label: 'Buscar en archivos', value: 'Grep()' },
  { label: 'Acceso web', value: 'WebFetch(domain:)' },
  { label: 'Buscar en la web', value: 'WebSearch' },
  { label: 'Herramienta MCP', value: 'MCPTool()' },
  { label: 'Cualquier herramienta', value: '' }
]

interface RawEntry {
  rule: string
  modes: string[]
}

function toEntries(value: unknown): RawEntry[] {
  if (!Array.isArray(value)) return []
  const out: RawEntry[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      out.push({ rule: item, modes: [] })
    } else if (item && typeof item === 'object') {
      const record = item as { rule?: unknown; modes?: unknown }
      if (typeof record.rule === 'string') {
        out.push({
          rule: record.rule,
          modes: Array.isArray(record.modes)
            ? record.modes.filter((mode): mode is string => typeof mode === 'string')
            : []
        })
      }
    }
  }
  return out
}

function emptyLists(): ModeLists {
  return { allow: [], ask: [], deny: [] }
}

export function PermissionsSection(): JSX.Element {
  const [scope, setScope] = useState<ScrakkScope>('project')
  const [rules, setRules] = useState<RuleRow[]>([])
  const [defaultMode, setDefaultMode] = useState<string>(() => getModeId())
  const [action, setAction] = useState<Action>('deny')
  const [ruleDraft, setRuleDraft] = useState('')
  const [selectedModes, setSelectedModes] = useState<string[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const modes = modeRegistry.getAll().filter((mode) => !ALIAS_MODES.has(mode.id))

  const openSelect = (event: MouseEvent<HTMLButtonElement>, items: ContextMenuItem[]): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom, items)
  }

  const labelOf = (id: string): string => modeRegistry.get(id)?.label ?? id

  // Carga el archivo de la capa elegida.
  useEffect(() => {
    let alive = true
    void (async () => {
      const result = await scrakkHandle(scope).readJson(FILE).catch(() => null)
      if (!alive) return
      const data = result?.ok ? result.data : null
      const permissions = (data?.permissions ?? {}) as Record<string, unknown>

      const rows: RuleRow[] = []
      for (const listAction of ACTIONS) {
        for (const entry of toEntries(permissions[listAction])) {
          rows.push({ action: listAction, rule: entry.rule, modes: entry.modes })
        }
      }
      const modeRules = data?.modeRules
      if (modeRules && typeof modeRules === 'object') {
        for (const [modeId, lists] of Object.entries(modeRules as Record<string, unknown>)) {
          const record = (lists ?? {}) as Record<string, unknown>
          for (const listAction of ACTIONS) {
            for (const entry of toEntries(record[listAction])) {
              rows.push({
                action: listAction,
                rule: entry.rule,
                modes: entry.modes.length > 0 ? entry.modes : [modeId]
              })
            }
          }
        }
      }
      setRules(rows)

      const mode = permissions.defaultMode ?? data?.defaultMode
      if (typeof mode === 'string') setDefaultMode(mode)
      setStatus(null)
      setError(null)
    })()
    return () => {
      alive = false
    }
  }, [scope])

  const toggleSelectedMode = (modeId: string): void => {
    setSelectedModes((prev) =>
      prev.includes(modeId) ? prev.filter((id) => id !== modeId) : [...prev, modeId]
    )
  }

  const addRule = (): void => {
    const text = ruleDraft.trim()
    if (!text) return
    if (!parsePermissionRule(text, action)) {
      setError(`Regla inválida: ${text}`)
      return
    }
    setError(null)
    setRules((prev) => [...prev, { action, rule: text, modes: [...selectedModes] }])
    setRuleDraft('')
  }

  const removeRule = (index: number): void => {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  const save = async (): Promise<void> => {
    setError(null)
    setStatus(null)

    const permissions: ModeLists = emptyLists()
    const modeRules: Record<string, ModeLists> = {}
    for (const row of rules) {
      if (row.modes.length === 0) {
        permissions[row.action].push(row.rule)
        continue
      }
      for (const modeId of row.modes) {
        modeRules[modeId] ??= emptyLists()
        modeRules[modeId][row.action].push(row.rule)
      }
    }

    const payload = { permissions: { ...permissions, defaultMode }, modeRules }
    const result = await scrakkHandle(scope)
      .writeJson(FILE, payload as unknown as Record<string, unknown>)
      .catch(() => null)
    if (!result?.ok) {
      setError(result?.error ?? 'No se pudo guardar')
      return
    }

    const base = parsePermissionLists(permissions)
    const scoped = parseModeRules(modeRules)
    for (const warning of [...base.warnings, ...scoped.warnings]) {
      console.warn(`[permissions] ${warning}`)
    }
    policyEngine.setPermissionRules([...base.rules, ...scoped.rules])
    applyMode(defaultMode)
    setStatus('Guardado y aplicado')
  }

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        Cada regla permite, pregunta o niega. Si no eliges modos, aplica a
        todos.
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
        <button
          type="button"
          className={styles.select}
          aria-haspopup="menu"
          onClick={(event) =>
            openSelect(
              event,
              modes.map((mode) => ({
                label: mode.label,
                checked: mode.id === defaultMode,
                onClick: () => setDefaultMode(mode.id)
              }))
            )
          }
        >
          <span className={styles.selectLabel}>
            Modo inicial: {modes.find((mode) => mode.id === defaultMode)?.label ?? defaultMode}
          </span>
          <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
        </button>
      </div>

      {scope === 'project' && !scrakkProjectRoot() ? (
        <p className={styles.empty}>No hay proyecto abierto: usa la capa de usuario.</p>
      ) : null}

      <div className={styles.group}>
        <span className={styles.groupLabel}>Reglas</span>
        {rules.length === 0 ? (
          <span className={styles.rowDesc}>Sin reglas.</span>
        ) : (
          <div className={styles.list}>
            {rules.map((row, index) => (
              <div key={`${row.action}-${row.rule}-${index}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    <code className={styles.code}>{row.rule}</code>
                    <span className={styles.badge}>{ACTION_LABEL[row.action]}</span>
                  </span>
                  <span className={styles.rowDesc}>
                    {row.modes.length === 0
                      ? 'Todos los modos'
                      : `Solo: ${row.modes.map(labelOf).join(', ')}`}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.rowAction}
                  onClick={() => removeRule(index)}
                  aria-label={`Quitar ${row.rule}`}
                >
                  <ProductIcon id="close" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Aplica a</span>
        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${selectedModes.length === 0 ? styles.chipActive : ''}`}
            onClick={() => setSelectedModes([])}
          >
            Todos los modos
          </button>
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`${styles.chip} ${selectedModes.includes(mode.id) ? styles.chipActive : ''}`}
              onClick={() => toggleSelectedMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.select}
          aria-haspopup="menu"
          onClick={(event) =>
            openSelect(
              event,
              ACTIONS.map((value) => ({
                label: ACTION_LABEL[value],
                checked: value === action,
                onClick: () => setAction(value)
              }))
            )
          }
        >
          <span className={styles.selectLabel}>{ACTION_LABEL[action]}</span>
          <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
        </button>
        <button
          type="button"
          className={styles.select}
          aria-haspopup="menu"
          onClick={(event) =>
            openSelect(
              event,
              TOOL_TEMPLATES.map((template) => ({
                label: template.label,
                onClick: () => setRuleDraft(template.value)
              }))
            )
          }
        >
          <span className={styles.selectLabel}>Herramienta</span>
          <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
        </button>
      </div>

      <div className={styles.formRow}>
        <input
          className={styles.input}
          value={ruleDraft}
          placeholder="Bash(git push:*) o Read(src/**)"
          spellCheck={false}
          onChange={(event) => setRuleDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addRule()
          }}
        />
        <button type="button" className={styles.saveBtn} onClick={addRule}>
          <ProductIcon id="plus" size={12} />
          Agregar
        </button>
      </div>

      <div className={styles.formRow}>
        <button type="button" className={styles.saveBtn} onClick={() => void save()}>
          <ProductIcon id="check" size={12} />
          Guardar y aplicar
        </button>
      </div>

      {status ? <span className={styles.status}>{status}</span> : null}
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  )
}

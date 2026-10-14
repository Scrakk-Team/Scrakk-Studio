// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Permisos" (Ajustes → Chat) — edita `.scrakk/permissions.json`.
 *
 * Reglas de permitir / preguntar / negar por herramienta, con alcance opcional
 * a ciertos modos. Al guardar se aplica al policy engine al instante y se
 * conserva el bloque `modeRules` (no lo pisa).
 *
 * Layout en tarjetas: arriba DÓNDE se guardan + el modo inicial; después la
 * LISTA de reglas (cada una con su color) y, aparte, el CONSTRUCTOR de una
 * regla nueva (acción → regla → a qué modos aplica → agregar).
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

import { t } from '@core/i18n'
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

const ALIAS_MODES = new Set(['auto_edit', 'all_allow'])

/** Plantillas para armar la regla sin conocer la sintaxis de memoria. */
const TOOL_TEMPLATES: Array<{ label: string; value: string }> = [
  { get label() { return t('settings.comando.de.shell') }, value: 'Bash()' },
  { get label() { return t('settings.leer.archivos') }, value: 'Read()' },
  { get label() { return t('settings.editar.archivos') }, value: 'Edit()' },
  { get label() { return t('settings.buscar.en.archivos') }, value: 'Grep()' },
  { get label() { return t('settings.acceso.web') }, value: 'WebFetch(domain:)' },
  { get label() { return t('settings.buscar.en.la.web') }, value: 'WebSearch' },
  { get label() { return t('settings.herramienta.mcp') }, value: 'MCPTool()' },
  { get label() { return t('settings.cualquier.herramienta') }, value: '' }
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

  // Etiquetas + color por acción (verde / ámbar / rojo).
  const actionLabel = (value: Action): string =>
    value === 'allow'
      ? t('settings.permitir')
      : value === 'ask'
        ? t('settings.preguntar')
        : t('settings.negar')
  const pillClass = (value: Action): string =>
    value === 'allow' ? styles.pillAllow : value === 'ask' ? styles.pillAsk : styles.pillDeny
  const markClass = (value: Action): string =>
    value === 'allow' ? styles.markAllow : value === 'ask' ? styles.markAsk : styles.markDeny
  const optClass = (value: Action): string =>
    value === 'allow'
      ? styles.optAllow
      : value === 'ask'
        ? styles.optAsk
        : styles.optDeny

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
    setSelectedModes([])
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
      setError(result?.error ?? t('settings.no.se.pudo.guardar'))
      return
    }

    const base = parsePermissionLists(permissions)
    const scoped = parseModeRules(modeRules)
    for (const warning of [...base.warnings, ...scoped.warnings]) {
      console.warn(`[permissions] ${warning}`)
    }
    policyEngine.setPermissionRules([...base.rules, ...scoped.rules])
    applyMode(defaultMode)
    setStatus(t('settings.guardado.y.aplicado'))
  }

  return (
    <div className={styles.section}>
      <p className={styles.hint}>{t('settings.cada.regla.permite.pregunta.o')}</p>

      {/* Dónde se guardan + modo inicial */}
      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('settings.donde.se.guardan.las.reglas')}</span>
          <div className={styles.segmented} role="group">
            <button
              type="button"
              className={`${styles.segment} ${scope === 'project' ? styles.segmentActive : ''}`}
              aria-pressed={scope === 'project'}
              onClick={() => setScope('project')}
            >
              {t('settings.proyecto')}
            </button>
            <button
              type="button"
              className={`${styles.segment} ${scope === 'user' ? styles.segmentActive : ''}`}
              aria-pressed={scope === 'user'}
              onClick={() => setScope('user')}
            >
              {t('settings.usuario')}
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('settings.modo.inicial')}</span>
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
              {modes.find((mode) => mode.id === defaultMode)?.label ?? defaultMode}
            </span>
            <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
          </button>
        </div>
      </div>

      {scope === 'project' && !scrakkProjectRoot() ? (
        <p className={styles.empty}>{t('settings.no.hay.proyecto.abierto.usa')}</p>
      ) : null}

      {/* Reglas activas */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>{t('settings.reglas')}</span>
        {rules.length === 0 ? (
          <span className={styles.rowDesc}>{t('settings.sin.reglas')}</span>
        ) : (
          <div className={styles.list}>
            {rules.map((row, index) => (
              <div key={`${row.action}-${row.rule}-${index}`} className={styles.row}>
                <span
                  className={`${styles.actionMark} ${markClass(row.action)}`}
                  aria-hidden="true"
                />
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    <code className={styles.code}>{row.rule}</code>
                    <span className={`${styles.badge} ${pillClass(row.action)}`}>
                      {actionLabel(row.action)}
                    </span>
                  </span>
                  <span className={styles.rowDesc}>
                    {row.modes.length === 0
                      ? t('settings.todos.los.modos')
                      : `${t('settings.aplica.a')}: ${row.modes.map(labelOf).join(', ')}`}
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

      {/* Constructor de una regla nueva */}
      <div className={styles.card}>
        <span className={styles.groupLabel}>{t('settings.agregar.regla')}</span>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('settings.accion')}</span>
          <div className={styles.actionPicker} role="group">
            {ACTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={[
                  styles.actionOption,
                  action === value ? optClass(value) : null
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={action === value}
                onClick={() => setAction(value)}
              >
                {actionLabel(value)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('settings.regla')}</span>
          <div className={styles.formRow}>
            <input
              className={styles.input}
              value={ruleDraft}
              placeholder={t('settings.bash.git.push.o.read')}
              spellCheck={false}
              onChange={(event) => setRuleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addRule()
              }}
            />
            <button
              type="button"
              className={styles.templateBtn}
              aria-haspopup="menu"
              title={t('settings.plantillas')}
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
              {t('settings.plantillas')}
              <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('settings.aplica.a')}</span>
          <div className={styles.chips}>
            <button
              type="button"
              className={`${styles.chip} ${selectedModes.length === 0 ? styles.chipActive : ''}`}
              onClick={() => setSelectedModes([])}
            >
              {t('settings.todos.los.modos')}
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

        <div className={styles.actions}>
          <button type="button" className={styles.linkBtn} onClick={addRule}>
            <ProductIcon id="plus" size={12} />
            {t('settings.agregar')}
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.saveBtn} onClick={() => void save()}>
          <ProductIcon id="check" size={12} />
          {t('settings.guardar.y.aplicar')}
        </button>
      </div>

      {status ? <span className={styles.status}>{status}</span> : null}
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  )
}

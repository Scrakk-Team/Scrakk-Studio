// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Agentes — storage en `.scrakk/agents/`.
 *
 *   .scrakk/agents/primary.json    → agentes PRIMARIOS (los que fueron "modos").
 *   .scrakk/agents/subagents.json  → SUBAGENTES reusables.
 *
 * Capas: usuario (`~/.scrakk`) y proyecto (`<root>/.scrakk`), gana el proyecto
 * por id. Migra `modes.json` la primera vez y hace SEED de un agente default
 * + el primer subagente **usando el mismo sistema** (writeJson), nunca
 * hardcodeado en el registry.
 */

import { scrakkNamespace, type ScrakkScope } from '@services/scrakk'
import { modeRegistry } from '../policy/modeRegistry'
import type { ModeDefinition } from '../policy/types'
import { readCustomModes, type CustomModeEntry } from '../policy/modeSettings'
import { agentRegistry } from './registry'
import {
  AGENT_MODEL_INHERIT,
  type AgentEntry,
  type AgentMode,
  type AgentPermissionsOverride,
  type AgentProfile,
  type AgentToolFilter
} from './types'

const DIR = 'agents'
const PRIMARY_FILE = 'primary.json'
const SUBAGENTS_FILE = 'subagents.json'

export type AgentKind = 'primary' | 'subagent'

function fileFor(kind: AgentKind): string {
  return kind === 'primary' ? PRIMARY_FILE : SUBAGENTS_FILE
}

function handleFor(scope: ScrakkScope) {
  return scrakkNamespace(DIR, scope)
}

// ── Parseo tolerante ────────────────────────────────────────────────────────

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  return out.length > 0 ? out : undefined
}

function parseToolFilter(value: unknown): AgentToolFilter | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as { include?: unknown; exclude?: unknown }
  const filter: AgentToolFilter = {}
  const include = asStringArray(record.include)
  const exclude = asStringArray(record.exclude)
  if (include) filter.include = include
  if (exclude) filter.exclude = exclude
  return Object.keys(filter).length > 0 ? filter : undefined
}

const MODES: AgentMode[] = ['primary', 'subagent', 'all']
const MUTATION = new Set(['always', 'never', 'auto'])
const SHELL = new Set(['always', 'never', 'auto'])
const PROMPT_POLICY = new Set(['ask', 'deny', 'auto'])

function parseOverrides(value: unknown): AgentPermissionsOverride | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const out: AgentPermissionsOverride = {}
  if (MUTATION.has(record.mutationBehavior as string)) {
    out.mutationBehavior = record.mutationBehavior as AgentPermissionsOverride['mutationBehavior']
  }
  if (SHELL.has(record.shellBehavior as string)) {
    out.shellBehavior = record.shellBehavior as AgentPermissionsOverride['shellBehavior']
  }
  if (PROMPT_POLICY.has(record.promptPolicy as string)) {
    out.promptPolicy = record.promptPolicy as AgentPermissionsOverride['promptPolicy']
  }
  if (typeof record.acceptEdits === 'boolean') out.acceptEdits = record.acceptEdits
  if (typeof record.bypassPermissions === 'boolean') {
    out.bypassPermissions = record.bypassPermissions
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseEntry(value: unknown): AgentEntry | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = asString(record.id)
  const label = asString(record.label)
  if (!id || !label) return null
  const mode = MODES.includes(record.mode as AgentMode) ? (record.mode as AgentMode) : undefined
  return {
    id,
    label,
    description: asString(record.description),
    icon: asString(record.icon),
    color: asString(record.color),
    mode,
    base: asString(record.base),
    prompt: asString(record.prompt),
    model: asString(record.model),
    reasoningEffort: asString(record.reasoningEffort),
    tools: parseToolFilter(record.tools),
    overrides: parseOverrides(record.overrides),
    subagents: asStringArray(record.subagents)
  }
}

// ── Resolución entrada → perfil ─────────────────────────────────────────────

export function resolveAgentEntry(entry: AgentEntry): AgentProfile | null {
  const mode: AgentMode = entry.mode ?? 'primary'
  const base =
    (entry.base ? modeRegistry.get(entry.base) : undefined) ?? modeRegistry.get('default')
  const o = entry.overrides ?? {}
  const profile: AgentProfile = {
    id: entry.id,
    label: entry.label,
    description: entry.description,
    icon: entry.icon,
    color: entry.color ?? base?.color,
    mode,
    prompt: entry.prompt ?? '',
    model: entry.model ?? AGENT_MODEL_INHERIT,
    reasoningEffort: entry.reasoningEffort,
    tools: entry.tools ?? base?.toolFilter ?? {},
    permissions: {
      mutationBehavior: o.mutationBehavior ?? base?.mutationBehavior ?? 'auto',
      shellBehavior: o.shellBehavior ?? base?.shellBehavior ?? 'auto',
      promptPolicy: o.promptPolicy ?? base?.promptPolicy ?? 'ask',
      acceptEdits: o.acceptEdits ?? base?.acceptEdits,
      bypassPermissions: o.bypassPermissions ?? base?.bypassPermissions
    },
    subagents: mode === 'subagent' ? undefined : entry.subagents
  }
  // Un subagente nunca puede re-invocar la tool `task` (evita recursión).
  if (mode === 'subagent') {
    profile.hardPermissions = { exclude: ['task'] }
  }
  return profile
}

// ── Lectura / escritura ─────────────────────────────────────────────────────

export async function readAgentEntries(
  scope: ScrakkScope,
  kind: AgentKind
): Promise<AgentEntry[]> {
  const result = await handleFor(scope)
    .readJson(fileFor(kind))
    .catch(() => null)
  const data = result?.ok ? result.data : null
  const list =
    data && Array.isArray((data as { agents?: unknown }).agents)
      ? ((data as { agents: unknown[] }).agents)
      : []
  return list.map(parseEntry).filter((entry): entry is AgentEntry => entry !== null)
}

export async function writeAgentEntries(
  scope: ScrakkScope,
  kind: AgentKind,
  entries: AgentEntry[]
): Promise<boolean> {
  const handle = handleFor(scope)
  await handle.mkdir().catch(() => null)
  const result = await handle
    .writeJson(fileFor(kind), { agents: entries as unknown as Record<string, unknown>[] })
    .catch(() => null)
  return result?.ok === true
}

// ── Migración de `modes.json` ───────────────────────────────────────────────

function customModeToAgent(entry: CustomModeEntry): AgentEntry {
  return {
    id: entry.id,
    label: entry.label,
    description: entry.description,
    icon: entry.icon,
    color: entry.color,
    mode: 'primary',
    base: entry.base,
    prompt: entry.prompt,
    model: AGENT_MODEL_INHERIT,
    tools: entry.overrides?.toolFilter,
    overrides: entry.overrides
      ? {
          mutationBehavior: entry.overrides.mutationBehavior,
          shellBehavior: entry.overrides.shellBehavior,
          promptPolicy: entry.overrides.promptPolicy,
          acceptEdits: entry.overrides.acceptEdits,
          bypassPermissions: entry.overrides.bypassPermissions
        }
      : undefined
  }
}

// ── Seed (sistema propio, NO builtin) ───────────────────────────────────────

/** Agente default: se ESCRIBE en primary.json al primer arranque. */
export const DEFAULT_PRIMARY_AGENT: AgentEntry = {
  id: 'asistente',
  label: 'Asistente',
  description: 'Agente general. Pregunta antes de acciones riesgosas.',
  icon: 'chat',
  color: '#6366f1',
  mode: 'primary',
  base: 'default',
  prompt: '',
  model: AGENT_MODEL_INHERIT,
  subagents: ['explorador']
}

/** Primer subagente: read-only, explora y resume. */
export const DEFAULT_SUBAGENT: AgentEntry = {
  id: 'explorador',
  label: 'Explorador',
  description:
    'Fast, read-only agent to explore the codebase. Use it to find files by pattern, search for symbols/callers, or answer how something works. It cannot edit files or run shell commands.',
  icon: 'search',
  color: '#0ea5e9',
  mode: 'subagent',
  base: 'plan',
  prompt:
    'You are the Explorer subagent. Read and search the codebase to answer the task, then report concise findings (files, symbols, relevant snippets). Never modify files or run shell commands.',
  model: AGENT_MODEL_INHERIT,
  tools: {
    include: [
      'read_file',
      'read_multiple_files',
      'list_directory',
      'file_search',
      'grep_search',
      'get_diagnostics'
    ]
  }
}

/** Descripción vieja del Explorador (para migrar instalaciones existentes). */
const LEGACY_EXPLORER_DESCRIPTION = 'Read-only: explora el código y resume hallazgos.'

// ── Carga / merge ───────────────────────────────────────────────────────────

async function readKind(kind: AgentKind): Promise<AgentEntry[]> {
  const [user, project] = await Promise.all([
    readAgentEntries('user', kind),
    readAgentEntries('project', kind)
  ])
  const merged = new Map<string, AgentEntry>()
  for (const entry of [...user, ...project]) merged.set(entry.id, entry)
  return [...merged.values()]
}

/**
 * Carga los agentes de ambas capas, migra `modes.json` y hace seed si hace
 * falta. Registra todo en `agentRegistry`.
 */
export async function loadAgentSettings(): Promise<{
  primaries: AgentEntry[]
  subagents: AgentEntry[]
}> {
  let primaries = await readKind('primary')
  const subagents = await readKind('subagent')

  // Migración: si no hay primarios propios, elevar los modos propios.
  if (primaries.length === 0) {
    const [userModes, projectModes] = await Promise.all([
      readCustomModes('user').catch(() => []),
      readCustomModes('project').catch(() => [])
    ])
    const merged = new Map<string, CustomModeEntry>()
    for (const entry of [...userModes, ...projectModes]) merged.set(entry.id, entry)
    if (merged.size > 0) {
      primaries = [...merged.values()].map(customModeToAgent)
      await writeAgentEntries('project', 'primary', primaries)
    }
  }

  // Seed: primer arranque sin nada → crear el default + el primer subagente.
  let seededSubagents = subagents
  if (primaries.length === 0) {
    primaries = [DEFAULT_PRIMARY_AGENT]
    await writeAgentEntries('project', 'primary', primaries)
  }
  if (seededSubagents.length === 0) {
    seededSubagents = [DEFAULT_SUBAGENT]
    await writeAgentEntries('project', 'subagent', seededSubagents)
  }

  // Migración: mejora la descripción del Explorador seedeado en versiones
  // previas (para que el modelo sepa cuándo usarlo).
  const migratedDescriptions = seededSubagents.map((entry) =>
    entry.id === 'explorador' && entry.description === LEGACY_EXPLORER_DESCRIPTION
      ? { ...entry, description: DEFAULT_SUBAGENT.description }
      : entry
  )
  if (migratedDescriptions.some((entry, index) => entry !== seededSubagents[index])) {
    seededSubagents = migratedDescriptions
    await writeAgentEntries('project', 'subagent', seededSubagents)
  }

  agentRegistry.clear()
  for (const entry of primaries) {
    const profile = resolveAgentEntry({ ...entry, mode: entry.mode ?? 'primary' })
    if (profile) {
      agentRegistry.register(profile)
      // Puente con el sistema de modos: cada primario es seleccionable como
      // "modo" del chat, así policy/prompt/tools lo resuelven sin cambios.
      modeRegistry.registerCustom(agentAsMode(profile))
    }
  }
  for (const entry of seededSubagents) {
    const profile = resolveAgentEntry({ ...entry, mode: entry.mode ?? 'subagent' })
    if (profile) agentRegistry.register(profile)
  }
  return { primaries, subagents: seededSubagents }
}

/** Traduce un agente primario al `ModeDefinition` que espera el policy engine. */
function agentAsMode(profile: AgentProfile): ModeDefinition {
  return {
    id: profile.id,
    label: profile.label,
    description: profile.description,
    color: profile.color,
    icon: profile.icon,
    prompt: profile.prompt,
    mutationBehavior: profile.permissions.mutationBehavior,
    shellBehavior: profile.permissions.shellBehavior,
    promptPolicy: profile.permissions.promptPolicy,
    acceptEdits: profile.permissions.acceptEdits,
    bypassPermissions: profile.permissions.bypassPermissions,
    toolFilter: profile.tools
  }
}

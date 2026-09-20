/**
 * Modos de aprobación propios — se guardan en `.scrakk/modes.json`.
 *
 * Un modo propio parte de un **preset base** (cualquier modo integrado:
 * default, plan, acceptEdits, auto, dontAsk, bypassPermissions) y solo
 * sobreescribe lo que el usuario toca. Así no hace falta entender los campos
 * internos para crear uno.
 *
 *   {
 *     "modes": [
 *       {
 *         "id": "shell-segura",
 *         "label": "Shell segura",
 *         "description": "Pregunta antes de tocar el shell.",
 *         "color": "#22c55e",
 *         "base": "default",
 *         "overrides": { "shellBehavior": "never" },
 *         "prompt": "..."
 *       }
 *     ]
 *   }
 *
 * Capas: usuario (`~/.scrakk/modes.json`) y proyecto
 * (`<root>/.scrakk/modes.json`); el proyecto gana por id.
 */

import { scrakkHandle, type ScrakkScope } from '@services/scrakk'
import { modeRegistry } from './modeRegistry'
import type {
  ModeDefinition,
  ModeMutationBehavior,
  ModeShellBehavior
} from './types'

const FILE = 'modes.json'
const DEFAULT_BASE = 'default'

export interface ModeOverrides {
  mutationBehavior?: ModeMutationBehavior
  shellBehavior?: ModeShellBehavior
  promptPolicy?: 'ask' | 'deny' | 'auto'
  acceptEdits?: boolean
  bypassPermissions?: boolean
  toolFilter?: { include?: string[]; exclude?: string[] }
}

/** Un modo de usuario tal como vive en `modes.json` (sin resolver). */
export interface CustomModeEntry {
  id: string
  label: string
  description?: string
  color?: string
  icon?: string
  base?: string
  overrides?: ModeOverrides
  prompt?: string
}

/** Convierte un texto en un id de modo seguro (`shell-segura`). */
export function slugifyModeId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

const MUTATION_VALUES = new Set<ModeMutationBehavior>(['always', 'never', 'auto'])
const SHELL_VALUES = new Set<ModeShellBehavior>(['always', 'never', 'auto'])
const PROMPT_POLICIES = new Set(['ask', 'deny', 'auto'])

function parseOverrides(value: unknown): ModeOverrides | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const out: ModeOverrides = {}
  if (MUTATION_VALUES.has(record.mutationBehavior as ModeMutationBehavior)) {
    out.mutationBehavior = record.mutationBehavior as ModeMutationBehavior
  }
  if (SHELL_VALUES.has(record.shellBehavior as ModeShellBehavior)) {
    out.shellBehavior = record.shellBehavior as ModeShellBehavior
  }
  if (PROMPT_POLICIES.has(record.promptPolicy as string)) {
    out.promptPolicy = record.promptPolicy as ModeOverrides['promptPolicy']
  }
  if (typeof record.acceptEdits === 'boolean') out.acceptEdits = record.acceptEdits
  if (typeof record.bypassPermissions === 'boolean') {
    out.bypassPermissions = record.bypassPermissions
  }
  const filter = record.toolFilter
  if (filter && typeof filter === 'object') {
    const { include, exclude } = filter as { include?: unknown; exclude?: unknown }
    const toolFilter: ModeOverrides['toolFilter'] = {}
    if (Array.isArray(include)) {
      toolFilter.include = include.filter((name): name is string => typeof name === 'string')
    }
    if (Array.isArray(exclude)) {
      toolFilter.exclude = exclude.filter((name): name is string => typeof name === 'string')
    }
    if (toolFilter.include?.length || toolFilter.exclude?.length) out.toolFilter = toolFilter
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseEntry(value: unknown): CustomModeEntry | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = asString(record.id)
  const label = asString(record.label)
  if (!id || !label) return null
  return {
    id: slugifyModeId(id),
    label,
    description: asString(record.description),
    color: asString(record.color),
    icon: asString(record.icon),
    base: asString(record.base),
    overrides: parseOverrides(record.overrides),
    prompt: asString(record.prompt)
  }
}

/** Resuelve una entrada a un `ModeDefinition` aplicando el preset base. */
export function resolveCustomMode(entry: CustomModeEntry): ModeDefinition | null {
  const base =
    modeRegistry.get(entry.base ?? DEFAULT_BASE) ??
    modeRegistry.get(DEFAULT_BASE) ??
    modeRegistry.getAll()[0]
  if (!base) return null
  const overrides = entry.overrides ?? {}
  return {
    id: entry.id,
    label: entry.label,
    description: entry.description ?? base.description,
    color: entry.color ?? base.color,
    icon: entry.icon,
    prompt: entry.prompt ?? '',
    mutationBehavior: overrides.mutationBehavior ?? base.mutationBehavior,
    shellBehavior: overrides.shellBehavior ?? base.shellBehavior,
    promptPolicy: overrides.promptPolicy ?? base.promptPolicy,
    acceptEdits: overrides.acceptEdits ?? base.acceptEdits,
    bypassPermissions: overrides.bypassPermissions ?? base.bypassPermissions,
    toolFilter: overrides.toolFilter
  }
}

/** Lee los modos propios de una capa (sin resolver). */
export async function readCustomModes(scope: ScrakkScope): Promise<CustomModeEntry[]> {
  const result = await scrakkHandle(scope).readJson(FILE).catch(() => null)
  const data = result?.ok ? result.data : null
  const list = data && Array.isArray((data as { modes?: unknown }).modes)
    ? ((data as { modes: unknown[] }).modes)
    : []
  return list
    .map(parseEntry)
    .filter((entry): entry is CustomModeEntry => entry !== null)
}

/** Escribe los modos propios de una capa. */
export async function writeCustomModes(
  scope: ScrakkScope,
  entries: CustomModeEntry[]
): Promise<boolean> {
  const result = await scrakkHandle(scope)
    .writeJson(FILE, { modes: entries as unknown as Record<string, unknown>[] })
    .catch(() => null)
  return result?.ok === true
}

/**
 * Carga y registra los modos propios (user → project, gana el proyecto).
 * Los built-in no se pisan ni se borran.
 */
export async function loadModeSettings(): Promise<CustomModeEntry[]> {
  const [user, project] = await Promise.all([
    readCustomModes('user'),
    readCustomModes('project')
  ])
  const merged = new Map<string, CustomModeEntry>()
  for (const entry of [...user, ...project]) merged.set(entry.id, entry)

  modeRegistry.clearCustom()
  const applied: CustomModeEntry[] = []
  for (const entry of merged.values()) {
    const definition = resolveCustomMode(entry)
    if (definition && modeRegistry.registerCustom(definition)) applied.push(entry)
  }
  return applied
}

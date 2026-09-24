// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Carga de reglas de permisos desde `.scrakk/permissions.json`.
 *
 * Mismo shape que Claude/`claude_settings.rs`:
 *   {
 *     "permissions": {
 *       "allow": ["Bash(npm run *)", "Read(src/**)"],
 *       "ask":   ["Bash(git push:*)"],
 *       "deny":  ["Read(**\/.env)"],
 *       "defaultMode": "acceptEdits"
 *     }
 *   }
 *
 * Capas: usuario (`~/.scrakk/permissions.json`) y proyecto
 * (`<root>/.scrakk/permissions.json`), que gana. Se aplica al policy engine.
 */

import { scrakkHandle } from '@services/scrakk'
import { policyEngine } from './policy-engine'
import {
  parsePermissionLists,
  parseModeRules,
  type PermissionRule
} from './permissionRules'
import { applyMode, getModeId } from '../prompts/modes'

const FILE = 'permissions.json'
const VALID_MODES = new Set([
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan',
  // alias históricos
  'auto_edit',
  'all_allow'
])

interface RawPermissionFile {
  permissions?: {
    allow?: unknown
    ask?: unknown
    deny?: unknown
    defaultMode?: unknown
  }
  /** Reglas acotadas por modo: `{ plan: { deny: [...] }, ... }`. */
  modeRules?: unknown
  /** Legacy: `defaultMode` en la raíz. */
  defaultMode?: unknown
}

function extract(file: RawPermissionFile | null): {
  allow: unknown
  ask: unknown
  deny: unknown
  modeRules: unknown
  defaultMode: string | null
} {
  if (!file) {
    return { allow: undefined, ask: undefined, deny: undefined, modeRules: undefined, defaultMode: null }
  }
  const permissions = file.permissions ?? {}
  const rawMode = permissions.defaultMode ?? file.defaultMode
  const defaultMode = typeof rawMode === 'string' && VALID_MODES.has(rawMode) ? rawMode : null
  return {
    allow: permissions.allow,
    ask: permissions.ask,
    deny: permissions.deny,
    modeRules: file.modeRules,
    defaultMode
  }
}

function concat(a: unknown, b: unknown): unknown[] {
  const out: unknown[] = []
  if (Array.isArray(a)) out.push(...a)
  if (Array.isArray(b)) out.push(...b)
  return out
}

/** Merge de `modeRules` de user + project: concatena las listas de cada modo. */
function mergeModeRules(a: unknown, b: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const left = asRecord(a)
  const right = asRecord(b)
  for (const modeId of new Set([...Object.keys(left), ...Object.keys(right)])) {
    out[modeId] = {
      allow: concat(asRecord(left[modeId]).allow, asRecord(right[modeId]).allow),
      ask: concat(asRecord(left[modeId]).ask, asRecord(right[modeId]).ask),
      deny: concat(asRecord(left[modeId]).deny, asRecord(right[modeId]).deny)
    }
  }
  return out
}

/**
 * Carga y aplica las reglas de `.scrakk/permissions.json` (user → project).
 * Devuelve las reglas aplicadas (útil para debug/Ajustes).
 */
export async function loadPermissionSettings(): Promise<PermissionRule[]> {
  const user = (await scrakkHandle('user').readJson(FILE).catch(() => null)) as
    | { ok: boolean; data: RawPermissionFile | null }
    | null
  const project = (await scrakkHandle('project').readJson(FILE).catch(() => null)) as
    | { ok: boolean; data: RawPermissionFile | null }
    | null

  const userFile = user?.ok ? user.data : null
  const projectFile = project?.ok ? project.data : null
  const userData = extract(userFile)
  const projectData = extract(projectFile)

  const { rules, warnings } = parsePermissionLists({
    allow: concat(userData.allow, projectData.allow),
    ask: concat(userData.ask, projectData.ask),
    deny: concat(userData.deny, projectData.deny)
  })
  const modeRules = parseModeRules(mergeModeRules(userData.modeRules, projectData.modeRules))
  const allRules = [...rules, ...modeRules.rules]
  for (const warning of [...warnings, ...modeRules.warnings]) {
    console.warn(`[permissions] ${warning}`)
  }

  policyEngine.setPermissionRules(allRules)

  const mode = projectData.defaultMode ?? userData.defaultMode
  if (mode) applyMode(mode)
  else policyEngine.setModeId(getModeId())

  return allRules
}

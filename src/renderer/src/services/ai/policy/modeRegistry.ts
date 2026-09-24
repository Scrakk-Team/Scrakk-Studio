// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Mode registry — manages built-in and custom approval modes
 */

import { ApprovalMode, type ModeDefinition } from './types'

/** Built-in mode IDs mapped to their ApprovalMode enum values */
export const BUILTIN_MODE_IDS: Record<ApprovalMode, string> = {
  [ApprovalMode.PLAN]: 'plan',
  [ApprovalMode.DEFAULT]: 'default',
  [ApprovalMode.AUTO_EDIT]: 'auto_edit',
  [ApprovalMode.ALL_ALLOW]: 'all_allow',
}

/** Built-in mode definitions */
const BUILTIN_MODES: ModeDefinition[] = [
  // ── Modos canónicos del CLI (DefaultPermissionMode) ─────────────────────
  {
    id: 'default',
    label: 'Default',
    description: 'Ask for permission before making changes.',
    color: '#6366f1',
    prompt: '',
    mutationBehavior: 'auto',
    shellBehavior: 'auto',
    promptPolicy: 'ask'
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Read-only: the AI can only read and plan, no edits or shell.',
    color: '#eab308',
    prompt: 'You are in Plan Mode. You can only read files and create plans. Do not make any edits.',
    mutationBehavior: 'never',
    shellBehavior: 'never',
    promptPolicy: 'ask',
    toolFilter: {
      exclude: ['write_file', 'replace_in_file', 'delete_file', 'move_file', 'append_file', 'execute_command']
    }
  },
  {
    id: 'acceptEdits',
    label: 'Accept Edits',
    description: 'Auto-approve file edits; still asks for shell commands.',
    color: '#22c55e',
    prompt: '',
    mutationBehavior: 'always',
    shellBehavior: 'auto',
    acceptEdits: true,
    promptPolicy: 'ask'
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'A classifier reviews each tool call; unsafe ones prompt.',
    color: '#0ea5e9',
    prompt: '',
    mutationBehavior: 'auto',
    shellBehavior: 'auto',
    promptPolicy: 'auto'
  },
  {
    id: 'dontAsk',
    label: 'Don\'t Ask',
    description: 'Silently deny anything that would need confirmation.',
    color: '#a855f7',
    prompt: '',
    mutationBehavior: 'auto',
    shellBehavior: 'auto',
    promptPolicy: 'deny'
  },
  {
    id: 'bypassPermissions',
    label: 'Bypass Permissions',
    description: 'Auto-approve everything. Use with caution.',
    color: '#ef4444',
    prompt: '',
    mutationBehavior: 'always',
    shellBehavior: 'always',
    bypassPermissions: true,
    promptPolicy: 'ask'
  },
  // ── Alias históricos de Scrakk Studio ───────────────────────────────────
  {
    id: 'auto_edit',
    label: 'Auto Edit (alias)',
    description: 'Alias de acceptEdits.',
    color: '#22c55e',
    prompt: '',
    mutationBehavior: 'always',
    shellBehavior: 'auto',
    acceptEdits: true,
    promptPolicy: 'ask'
  },
  {
    id: 'all_allow',
    label: 'Allow All (alias)',
    description: 'Alias de bypassPermissions.',
    color: '#ef4444',
    prompt: '',
    mutationBehavior: 'always',
    shellBehavior: 'always',
    bypassPermissions: true,
    promptPolicy: 'ask'
  }
]

class ModeRegistry {
  private modes = new Map<string, ModeDefinition>()
  /** Ids de modos de usuario (para limpiarlos al recargar `modes.json`). */
  private customIds = new Set<string>()

  constructor() {
    // Register built-in modes
    for (const mode of BUILTIN_MODES) {
      this.modes.set(mode.id, mode)
    }
  }

  register(mode: ModeDefinition): void {
    this.modes.set(mode.id, mode)
  }

  /** Registra un modo de usuario (no puede pisar un built-in). */
  registerCustom(mode: ModeDefinition): boolean {
    if (BUILTIN_MODES.some((builtin) => builtin.id === mode.id)) {
      console.warn(`[modes] ignorando modo propio '${mode.id}': colisiona con uno integrado`)
      return false
    }
    this.modes.set(mode.id, mode)
    this.customIds.add(mode.id)
    return true
  }

  /** Quita todos los modos de usuario (antes de recargar `modes.json`). */
  clearCustom(): void {
    for (const id of this.customIds) {
      this.modes.delete(id)
    }
    this.customIds.clear()
  }

  isCustom(id: string): boolean {
    return this.customIds.has(id)
  }

  listCustom(): ModeDefinition[] {
    return Array.from(this.customIds)
      .map((id) => this.modes.get(id))
      .filter((mode): mode is ModeDefinition => mode !== undefined)
  }

  unregister(id: string): boolean {
    return this.modes.delete(id)
  }

  get(id: string): ModeDefinition | undefined {
    return this.modes.get(id)
  }

  getAll(): ModeDefinition[] {
    return Array.from(this.modes.values())
  }

  getByApprovalMode(approvalMode: ApprovalMode): ModeDefinition | undefined {
    return this.modes.get(BUILTIN_MODE_IDS[approvalMode])
  }
}

export const modeRegistry = new ModeRegistry()

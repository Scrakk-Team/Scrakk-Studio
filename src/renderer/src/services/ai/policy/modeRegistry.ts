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
  {
    id: 'plan',
    label: 'Plan Mode',
    description: 'Read-only: AI can only read files and plan, no edits allowed.',
    color: '#eab308',
    prompt: 'You are in Plan Mode. You can only read files and create plans. Do not make any edits.',
    mutationBehavior: 'never',
    shellBehavior: 'never',
    toolFilter: {
      exclude: ['write_file', 'replace_in_file', 'delete_file', 'move_file', 'append_file', 'execute_command']
    }
  },
  {
    id: 'default',
    label: 'Default',
    description: 'Ask for permission before making changes.',
    color: '#6366f1',
    prompt: '',
    mutationBehavior: 'auto',
    shellBehavior: 'auto',
  },
  {
    id: 'auto_edit',
    label: 'Auto Edit',
    description: 'Auto-approve file edits, ask for shell commands.',
    color: '#22c55e',
    prompt: '',
    mutationBehavior: 'always',
    shellBehavior: 'auto',
  },
  {
    id: 'all_allow',
    label: 'Allow All',
    description: 'Auto-approve everything. Use with caution.',
    color: '#ef4444',
    prompt: '',
    mutationBehavior: 'always',
    shellBehavior: 'always',
  },
]

class ModeRegistry {
  private modes = new Map<string, ModeDefinition>()

  constructor() {
    // Register built-in modes
    for (const mode of BUILTIN_MODES) {
      this.modes.set(mode.id, mode)
    }
  }

  register(mode: ModeDefinition): void {
    this.modes.set(mode.id, mode)
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

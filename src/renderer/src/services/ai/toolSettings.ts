// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tool settings service — manages per-tool enable/disable and approval mode.
 */

import { registry } from './tools/registry'
import type { ToolMeta } from './tools/types'

interface ToolSettings {
  enabled: { [toolName: string]: boolean }
  approvalMode: string
}

const STORAGE_KEY = 'scrakk-studio:tool-settings'

const DEFAULT_META: Record<string, ToolMeta> = {
  read_file: { name: 'read_file', label: 'Read File', description: 'Read file contents', type: 'file', dangerLevel: 'safe', enabledByDefault: true },
  read_multiple_files: { name: 'read_multiple_files', label: 'Read Multiple Files', description: 'Read multiple files at once', type: 'file', dangerLevel: 'safe', enabledByDefault: true },
  write_file: { name: 'write_file', label: 'Write File', description: 'Create or overwrite files', type: 'file', dangerLevel: 'high', enabledByDefault: true },
  append_file: { name: 'append_file', label: 'Append File', description: 'Append content to existing files', type: 'file', dangerLevel: 'medium', enabledByDefault: true },
  replace_in_file: { name: 'replace_in_file', label: 'Replace in File', description: 'Replace text in files', type: 'file', dangerLevel: 'high', enabledByDefault: true },
  delete_file: { name: 'delete_file', label: 'Delete File', description: 'Delete files from the project', type: 'file', dangerLevel: 'high', enabledByDefault: true },
  move_file: { name: 'move_file', label: 'Move/Rename File', description: 'Move or rename files', type: 'file', dangerLevel: 'medium', enabledByDefault: true },
  list_directory: { name: 'list_directory', label: 'List Directory', description: 'List directory contents', type: 'file', dangerLevel: 'safe', enabledByDefault: true },
  file_search: { name: 'file_search', label: 'File Search', description: 'Search files by pattern', type: 'code', dangerLevel: 'safe', enabledByDefault: true },
  grep_search: { name: 'grep_search', label: 'Grep Search', description: 'Search text in files', type: 'code', dangerLevel: 'safe', enabledByDefault: true },
  get_diagnostics: { name: 'get_diagnostics', label: 'Get Diagnostics', description: 'Check files for errors', type: 'code', dangerLevel: 'safe', enabledByDefault: true },
  execute_command: { name: 'execute_command', label: 'Execute Command', description: 'Run shell commands', type: 'system', dangerLevel: 'high', enabledByDefault: true },
  create_app_blueprint: { name: 'create_app_blueprint', label: 'Create Blueprint', description: 'Create app plan/blueprint', type: 'utility', dangerLevel: 'safe', enabledByDefault: true },
  history_title: { name: 'history_title', label: 'Set Title', description: 'Set conversation title', type: 'utility', dangerLevel: 'safe', enabledByDefault: true },
  adjust_timeout: { name: 'adjust_timeout', label: 'Adjust Timeout', description: 'Extend command timeout', type: 'utility', dangerLevel: 'low', enabledByDefault: true },
  multiple_tools: { name: 'multiple_tools', label: 'Multiple Tools', description: 'Execute tools in sequence', type: 'utility', dangerLevel: 'medium', enabledByDefault: true },
}

class ToolSettingsService {
  private settings: ToolSettings
  private sessionOverrides = new Map<string, { enabled: { [key: string]: boolean } }>()

  constructor() {
    this.settings = this.load()
  }

  private load(): ToolSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as ToolSettings
    } catch { /* ignore */ }
    const defaults: ToolSettings = { enabled: {}, approvalMode: 'default' }
    for (const [name, meta] of Object.entries(DEFAULT_META)) {
      defaults.enabled[name] = meta.enabledByDefault
    }
    return defaults
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('tool-settings-changed', { detail: this.settings }))
  }

  isGloballyEnabled(toolName: string): boolean {
    return this.settings.enabled[toolName] !== false
  }

  setGloballyEnabled(toolName: string, enabled: boolean): void {
    this.settings.enabled[toolName] = enabled
    this.save()
  }

  getApprovalMode(): string {
    return this.settings.approvalMode
  }

  setApprovalMode(mode: string): void {
    this.settings.approvalMode = mode
    this.save()
  }

  getMeta(toolName: string): ToolMeta | undefined {
    return DEFAULT_META[toolName]
  }

  getAllMeta(): Record<string, ToolMeta> {
    return { ...DEFAULT_META }
  }

  getAllTools(sessionId: string | null = null): Array<{
    name: string
    meta: ToolMeta
    enabled: boolean
    extensionId?: string
  }> {
    const liveNames = new Set(registry.getNames())
    const liveTools = new Map(
      registry.getAll().map(t => [t.name, t] as const)
    )
    const allNames = new Set<string>([...liveNames, ...Object.keys(DEFAULT_META)])

    return Array.from(allNames).map(name => {
      const live = liveTools.get(name)
      const fallback: ToolMeta = {
        name,
        label: name,
        description: '',
        type: 'utility',
        dangerLevel: 'low',
        enabledByDefault: true,
      }
      const meta: ToolMeta = live?.meta ?? DEFAULT_META[name] ?? fallback
      return {
        name,
        meta,
        enabled: this.isEnabledForSession(sessionId, name),
        extensionId: live?.extensionId,
      }
    })
  }

  getEnabledTools(): string[] {
    return Object.entries(this.settings.enabled)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
  }

  getSessionOverride(sessionId: string): { enabled: { [key: string]: boolean } } | undefined {
    return this.sessionOverrides.get(sessionId)
  }

  setSessionOverride(sessionId: string, toolName: string, enabled: boolean): void {
    let override = this.sessionOverrides.get(sessionId)
    if (!override) {
      override = { enabled: {} }
      this.sessionOverrides.set(sessionId, override)
    }
    override.enabled[toolName] = enabled
    window.dispatchEvent(new CustomEvent('tool-settings-session-changed', {
      detail: { sessionId, toolName, enabled },
    }))
  }

  isEnabledForSession(sessionId: string | null, toolName: string): boolean {
    if (sessionId) {
      const override = this.sessionOverrides.get(sessionId)
      if (override && override.enabled[toolName] !== undefined) {
        return override.enabled[toolName]
      }
    }
    return this.isGloballyEnabled(toolName)
  }

  clearSessionOverrides(sessionId: string): void {
    this.sessionOverrides.delete(sessionId)
  }
}

export const toolSettingsService = new ToolSettingsService()

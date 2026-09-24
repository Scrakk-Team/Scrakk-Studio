// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Central tool registry
 */

import type { Tool, ToolDefinition } from './types'

export type ToolRegistryChange = { type: 'register' | 'unregister'; name: string }

export interface RegisterOptions {
  /**
   * Allow overwriting an already-registered tool with the same name.
   * Defaults to false to prevent silent shadowing of built-in tools.
   */
  allowOverwrite?: boolean
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()
  private subscribers = new Set<(change: ToolRegistryChange) => void>()

  register(tool: Tool, options: RegisterOptions = {}): void {
    if (this.tools.has(tool.name)) {
      const existing = this.tools.get(tool.name)!
      const isBuiltIn = !existing.extensionId
      const newIsExtension = !!tool.extensionId

      if (!options.allowOverwrite) {
        const owner = isBuiltIn ? 'built-in' : `extension "${existing.extensionId}"`
        const src = newIsExtension ? `extension "${tool.extensionId}"` : 'another tool'
        console.error(
          `[ToolRegistry] REFUSING to overwrite ${owner} tool "${tool.name}" ` +
          `with ${src}. Pass \`{ allowOverwrite: true }\` to the register() call ` +
          `if this is intentional. The new tool was NOT registered.`
        )
        return
      }
      console.warn(
        `[ToolRegistry] Overwriting tool "${tool.name}" ` +
        `(was ${isBuiltIn ? 'built-in' : `extension ${existing.extensionId}`}, ` +
        `now ${newIsExtension ? `extension ${tool.extensionId}` : 'built-in'})`
      )
    }
    this.tools.set(tool.name, tool)
    this.notify({ type: 'register', name: tool.name })
  }

  unregister(name: string): void {
    if (this.tools.delete(name)) {
      this.notify({ type: 'unregister', name })
    }
  }

  unregisterByExtension(extensionId: string): void {
    for (const tool of this.tools.values()) {
      if (tool.extensionId === extensionId) {
        this.unregister(tool.name)
      }
    }
  }

  subscribe(cb: (change: ToolRegistryChange) => void): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  private notify(change: ToolRegistryChange): void {
    for (const cb of this.subscribers) {
      try {
        cb(change)
      } catch (err) {
        console.error('[ToolRegistry] subscriber error', err)
      }
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values())
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  getDefinitions(): ToolDefinition[] {
    return this.getAll().map(t => t.definition)
  }

  getNames(): string[] {
    return Array.from(this.tools.keys())
  }

  getDefinitionsFiltered(keep: Set<string>): ToolDefinition[] {
    return this.getAll()
      .filter(t => keep.has(t.name))
      .map(t => t.definition)
  }

  getPermissionsForTool(name: string) {
    const tool = this.tools.get(name)
    return tool?.permissions ?? []
  }
}

export const registry = new ToolRegistry()

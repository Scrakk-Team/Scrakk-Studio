/**
 * CommandRegistry — registro central de comandos del IDE.
 *
 * Cada módulo/feature registra sus acciones acá; la paleta y los shortcuts
 * las consumen. Mismo patrón de store con subscribe que el resto del app.
 */

import { fuzzyScore } from './fuzzy'
import { shortcuts } from '@services/shortcuts'

export interface Command {
  /** Id único, namespaced: 'layout.toggleChat', 'theme.cycle', … */
  id: string
  title: string
  category?: string
  icon?: string
  /** Combo preferido (se registra en shortcuts si no está tomado). */
  keybinding?: string
  run: () => void | Promise<void>
}

class CommandRegistryClass {
  private commands = new Map<string, Command>()
  private listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // suscriptor roto no tumba al resto
      }
    }
  }

  register(command: Command, options: { allowOverwrite?: boolean } = {}): () => void {
    if (this.commands.has(command.id) && !options.allowOverwrite) {
      console.warn(`[commands] "${command.id}" ya registrado — ignorado`)
      return () => undefined
    }
    this.commands.set(command.id, command)

    // Shortcut REAL: cada comando con keybinding queda registrado en el
    // sistema global de atajos — el panel que lo pidió no hace nada más.
    let unsubShortcut: (() => void) | null = null
    if (command.keybinding) {
      unsubShortcut = shortcuts.register({
        id: `command:${command.id}`,
        combo: command.keybinding,
        description: command.title,
        handler: () => {
          void command.run()
        },
        priority: 10
      })
    }

    this.emit()
    return () => {
      unsubShortcut?.()
      this.unregister(command.id)
    }
  }

  unregister(id: string): void {
    const removed = this.commands.delete(id)
    if (!removed) return
    // Limpiar el shortcut asociado si este registro lo creó.
    shortcuts.unregister(`command:${id}`)
    this.emit()
  }

  get(id: string): Command | null {
    return this.commands.get(id) ?? null
  }

  list(): Command[] {
    return [...this.commands.values()].sort(
      (a, b) =>
        (a.category ?? '').localeCompare(b.category ?? '') ||
        a.title.localeCompare(b.title)
    )
  }

  /** Búsqueda fuzzy por title + category + id. */
  search(query: string): Command[] {
    const scored = this.list()
      .map((command) => ({
        command,
        score:
          fuzzyScore(query, command.title) +
          fuzzyScore(query, command.category ?? '') +
          fuzzyScore(query, command.id)
      }))
      .filter((entry) => entry.score > 0)
    scored.sort((a, b) => b.score - a.score)
    return scored.map((entry) => entry.command)
  }
}

export const commandRegistry = new CommandRegistryClass()

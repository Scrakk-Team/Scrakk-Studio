/**
 * Registry global de comandos con barra.
 *
 * Cualquier subsistema registra sus comandos acá y cualquier input los ejecuta
 * con `run()`. Los comandos NO saben de UI: reciben contexto y devuelven un
 * mensaje; el input decide cómo mostrarlo. Mismo patrón de subscribes que el
 * resto de los stores de la app.
 */

import type { SlashCommand, SlashCommandContext, SlashCommandResult } from './types'
import { parseSlashCommand } from './parse'

class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>()
  private listeners = new Set<() => void>()

  /**
   * Registra un comando. Por defecto NO pisa uno existente (evita que una
   * extensión reemplace un comando built-in); reintentos idempotentes del
   * mismo dueño pueden pasar `{ allowOverwrite: true }`.
   */
  register(command: SlashCommand, options: { allowOverwrite?: boolean } = {}): void {
    const name = command.name.toLowerCase()
    if (this.commands.has(name) && !options.allowOverwrite) {
      console.warn(`[commands] ya existe "/${name}"; no se reemplaza`)
      return
    }
    this.commands.set(name, { ...command, name })
    this.emit()
  }

  unregister(name: string): void {
    if (this.commands.delete(name.toLowerCase())) this.emit()
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name.toLowerCase())
  }

  list(): SlashCommand[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Comandos cuyo nombre arranca con `prefix` (sin la barra). */
  match(prefix: string): SlashCommand[] {
    const q = prefix.toLowerCase()
    return this.list().filter((command) => command.name.startsWith(q))
  }

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
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }

  /** Ejecuta un texto `/comando args` y devuelve su resultado. */
  async run(
    input: string,
    ctx: { source: string; sessionId?: string | null }
  ): Promise<SlashCommandResult> {
    const parsed = parseSlashCommand(input)
    if (!parsed) return { ok: false, error: 'No es un comando (falta la barra)' }
    const command = this.get(parsed.name)
    if (!command) {
      return { ok: false, error: `Comando desconocido: /${parsed.name}` }
    }
    const context: SlashCommandContext = {
      source: ctx.source,
      sessionId: ctx.sessionId ?? null,
      args: parsed.args,
      rawArgs: parsed.rawArgs
    }
    try {
      return await command.run(context)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

export const slashCommands = new SlashCommandRegistry()

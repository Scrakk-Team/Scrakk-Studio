/**
 * Sistema de comandos con barra (`/comando`) — API global.
 *
 * - `slashCommands`: registry (registrar/listar/ejecutar).
 * - `isSlashInput` / `parseSlashCommand`: helpers para inputs.
 */

export { slashCommands } from './registry'
export { isSlashInput, parseSlashCommand } from './parse'
export type { ParsedSlashCommand } from './parse'
export type {
  SlashCommand,
  SlashCommandArgument,
  SlashCommandContext,
  SlashCommandResult
} from './types'

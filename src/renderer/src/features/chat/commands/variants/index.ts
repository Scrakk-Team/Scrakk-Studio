/**
 * Comando `/variants` — define el contrato y lo registra.
 *
 * La funcionalidad vive en `logic.ts` (mismo espíritu que las tools): acá solo
 * se declara el comando y se delega.
 */

import { slashCommands, type SlashCommand } from '@services/slash-commands'
import { applyVariant, openVariantsPicker } from './logic'

export const variantsCommand: SlashCommand = {
  name: 'variants',
  description: 'Elige la variante de razonamiento (effort) del modelo activo.',
  usage: '/variants [<valor>|auto]',
  category: 'Chat',
  args: [{ name: 'valor', description: 'Variante a aplicar (o "auto" para limpiar)' }],
  run: (ctx) => {
    // Sin argumento: selector con UI propia (modal de opciones).
    if (ctx.args.length === 0) return openVariantsPicker()
    return applyVariant(ctx.args[0])
  }
}

export function registerVariantsCommand(): void {
  slashCommands.register(variantsCommand, { allowOverwrite: true })
}

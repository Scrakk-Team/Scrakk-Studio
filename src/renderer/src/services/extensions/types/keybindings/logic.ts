// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión 'keybindings' — lógica.
 *
 * El atajo se registra en el MISMO motor que los de la app (sin un segundo
 * sistema) y al pulsarlo ejecuta el comando:
 *
 *  1. en la paleta (`runCommand`, incluye los comandos que registra el bundle
 *     de la extensión con `window.scrakk.commands.register`); o
 *  2. en el Extension Host (extensiones con `runtime`, el modelo VSIX).
 */

import { runCommand } from '@services/commands'
import { shortcuts } from '@services/shortcuts'
import type { ExtensionTypeContext } from '../handler'
import type { KeybindingContribution } from './schema'

async function runBinding(extensionId: string, command: string): Promise<void> {
  if (await runCommand(command)) return
  try {
    await window.api?.extensions?.host?.executeCommand({ id: extensionId, command, args: [] })
  } catch {
    // Sin comando en la paleta ni host: el atajo no hace nada. Se avisó al
    // registrar (el comando tiene que existir en algún lado).
  }
}

/** Registra el atajo y devuelve su baja. */
export function activateKeybinding(
  contribution: KeybindingContribution,
  ctx: ExtensionTypeContext
): () => void {
  return shortcuts.register({
    id: `ext:${ctx.extensionId}:${contribution.command}`,
    combo: contribution.key,
    description: `${ctx.extensionId} · ${contribution.command}`,
    handler: () => {
      void runBinding(ctx.extensionId, contribution.command)
    }
  })
}

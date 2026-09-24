// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Servicio de comandos — API pública.
 *
 * El registro central (`commandRegistry`) más helpers para abrir la paleta.
 * Los comandos nativos se registran desde cada feature (layoutBridge,
 * ThemeProvider, App) — nada hardcodeado en un solo lugar.
 */

import { commandRegistry, type Command } from './registry'

export { commandRegistry }
export type { Command }

/** Evento global para abrir la paleta desde cualquier parte. */
const OPEN_EVENT = 'open-command-palette'

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}

export function onOpenCommandPalette(callback: () => void): () => void {
  window.addEventListener(OPEN_EVENT, callback)
  return () => {
    window.removeEventListener(OPEN_EVENT, callback)
  }
}

/** Ejecuta un comando por id (útil para shortcuts y futuras APIs). */
export async function runCommand(id: string): Promise<boolean> {
  const command = commandRegistry.get(id)
  if (!command) return false
  await command.run()
  return true
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Comandos del chat con IA — registro.
 *
 * Cada comando vive en su carpeta con su `logic.ts` (la funcionalidad) y su
 * `index.ts` (el contrato + registro). Sumar un comando = crear la carpeta y
 * llamarlo acá.
 */

import { registerVariantsCommand } from './variants'

export function registerChatCommands(): void {
  registerVariantsCommand()
}

export { variantsCommand } from './variants'

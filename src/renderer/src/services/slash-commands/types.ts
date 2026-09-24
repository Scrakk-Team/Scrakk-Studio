// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Contrato del sistema de comandos con barra (`/comando`).
 *
 * Es una API GLOBAL: cualquier input (chat con IA, chat social, un panel, una
 * extensión) puede ejecutar comandos y registrar los suyos. Cada comando vive
 * con su lógica en su propia carpeta (mismo espíritu que las tools: `logic.ts`
 * trae la funcionalidad), y el registry solo guarda el contrato.
 */

export interface SlashCommandContext {
  /** De dónde vino el comando: 'chat' (IA), 'social', 'editor', … */
  source: string
  /** Id de sesión si el input pertenece a una (chat con IA). */
  sessionId?: string | null
  /** Argumentos ya separados. */
  args: string[]
  /** Texto crudo posterior al nombre (sin recortar). */
  rawArgs: string
}

export interface SlashCommandResult {
  ok: boolean
  /** Mensaje para mostrar al usuario (éxito o información). */
  message?: string
  /** Motivo del fallo cuando `ok = false`. */
  error?: string
  /**
   * El comando ya mostró su PROPIA UI (modal, menú, panel). El input no debe
   * agregar un mensaje de texto con el resultado.
   */
  ui?: boolean
}

export interface SlashCommandArgument {
  name: string
  description?: string
  required?: boolean
  /** Valores admitidos (para autocompletado y ayuda). */
  options?: string[]
}

export interface SlashCommand {
  /** Nombre sin la barra (ej. `variants`). */
  name: string
  description: string
  /** Línea de uso (ej. `/variants <low|high|max>`). */
  usage?: string
  args?: SlashCommandArgument[]
  /** Categoría para agrupar en la ayuda. */
  category?: string
  /** Ejecuta el comando con su lógica real. */
  run: (ctx: SlashCommandContext) => Promise<SlashCommandResult> | SlashCommandResult
}

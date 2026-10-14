// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Puente de RUNTIME para bundles `.sef` (lo que el paquete registra en el IDE).
 *
 * Un bundle corre en el renderer pero no puede importar módulos del IDE (salvo
 * los shims de `runtime/`): lo que necesita del IDE lo registra acá. Dos cosas:
 *
 *  - **Comandos de paleta** (`window.scrakk.commands.register`): quedan en la
 *    barra de comandos del IDE.
 *  - **Handlers de tools de IA** (`window.scrakk.tools.register`): el `command`
 *    que el manifest declara en `contributes.tools` se resuelve ACÁ cuando la
 *    extensión es **declarativa** (sin `runtime`/Extension Host). Sin esto, un
 *    tool de una extensión sin código no tendría quién lo ejecute: el único
 *    camino documentado era el host, y una extensión de solo-UI no lo tiene.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OWNERSHIP
 *
 * El loader importa los bundles de a uno y marca cuál es el dueño mientras
 * corre su top-level (`withExtensionOwner`). Todo lo que se registre en ese
 * momento queda a nombre de esa extensión: se puede atribuir (no se pisan ids
 * entre paquetes) y se desregistra al desinstalarla/desactivarla
 * (`disposeRuntimeHandlers`), que es lo que evita comandos fantasma.
 *
 * Un registro hecho DESPUÉS del import (dentro de un `setTimeout`, por ejemplo)
 * queda sin dueño y se descarta con un warning: el contrato es registrar en el
 * top-level del bundle.
 */

import { commandRegistry } from '@services/commands'

/** Función que un bundle registra (comando de paleta o handler de tool). */
export type RuntimeFn = (...args: unknown[]) => unknown | Promise<unknown>

/** Registro de un comando de paleta desde un bundle. */
export interface RuntimeCommandInput {
  /** Id sin namespace: el IDE lo prefija con el id de la extensión. */
  id: string
  title: string
  category?: string
  run: RuntimeFn
}

/** La superficie que el IDE le presta a los bundles, en `window.scrakk`. */
export interface ScrakkRuntimeApi {
  commands: {
    /** Registra un comando de la paleta. Devuelve su baja. */
    register: (input: RuntimeCommandInput) => () => void
  }
  tools: {
    /**
     * Atiende un `command` declarado en `contributes.tools`. Devuelve su baja.
     */
    register: (command: string, run: RuntimeFn) => () => void
  }
}

interface ToolHandler {
  extensionId: string
  command: string
  run: RuntimeFn
}

/** Dueño actual (el bundle que se está importando). */
let owner: string | null = null

const toolHandlers = new Map<string, ToolHandler>()
const disposers = new Map<string, Array<() => void>>()

/** Clave de un handler: el comando NO es único entre extensiones. */
function handlerKey(extensionId: string, command: string): string {
  return `${extensionId}\u0000${command}`
}

/**
 * Corre `fn` con `extensionId` como dueño de lo que registre.
 *
 * El loader lo usa alrededor del `import()` del bundle (ver `installed.ts`).
 */
export async function withExtensionOwner<T>(extensionId: string, fn: () => Promise<T>): Promise<T> {
  const previous = owner
  owner = extensionId
  try {
    return await fn()
  } finally {
    owner = previous
  }
}

/** Dueño actual, o `null` si el registro viene de fuera del import. */
function requireOwner(what: string): string | null {
  if (owner) return owner
  console.warn(
    `[extensions] ${what} sin extensión dueña: registrá en el top-level del bundle`
  )
  return null
}

/** Anota una baja para que `disposeRuntimeHandlers` la corra al desinstalar. */
function track(extensionId: string, off: () => void): void {
  const list = disposers.get(extensionId) ?? []
  list.push(off)
  disposers.set(extensionId, list)
}

/** Registra un comando de paleta en nombre de la extensión dueña. */
export function registerPaletteCommand(input: RuntimeCommandInput): () => void {
  const extensionId = requireOwner('commands.register')
  if (!extensionId) return () => undefined
  const off = commandRegistry.register({
    id: `${extensionId}:${input.id}`,
    title: input.title,
    category: input.category,
    // La paleta corre `run()` sin args; el comando puede ignorarlos.
    run: () => {
      void input.run()
    }
  })
  track(extensionId, off)
  return off
}

/** Registra el handler de un tool de IA en nombre de la extensión dueña. */
export function registerToolHandler(command: string, run: RuntimeFn): () => void {
  const extensionId = requireOwner('tools.register')
  if (!extensionId) return () => undefined
  const key = handlerKey(extensionId, command)
  const off = (): void => {
    toolHandlers.delete(key)
  }
  toolHandlers.set(key, { extensionId, command, run })
  track(extensionId, off)
  return off
}

/** Handler de runtime del tool `command` de `extensionId` (o `null`). */
export function getToolHandler(extensionId: string, command: string): RuntimeFn | null {
  return toolHandlers.get(handlerKey(extensionId, command))?.run ?? null
}

/** Desregistra TODO lo que la extensión registró en runtime. */
export function disposeRuntimeHandlers(extensionId: string): void {
  const list = disposers.get(extensionId)
  disposers.delete(extensionId)
  if (!list) return
  for (const off of list) {
    try {
      off()
    } catch (error) {
      console.warn(`[extensions] error dando de baja un handler de "${extensionId}":`, error)
    }
  }
}

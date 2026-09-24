// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión 'lspServers' — lógica.
 *
 * Sincroniza las contribuciones con el runtime LSP del proceso main:
 * registerDynamicServers al instalar/boot, removeDynamicServers al
 * desinstalar. Sin estado propio: cada boot de extensiones re-registra.
 */

import type { DynamicLspServerDef } from '@shared/lsp'
import type { LspContribution } from './schema'

/**
 * `command` del server → ruta ejecutable.
 *
 * Muchos LSPs de VS Code viajan DENTRO de la extensión y su entry es un módulo
 * node (`./server/out/server.js`), no un binario del sistema. Un `command`
 * relativo (`./…` / `../…`) se resuelve contra la raíz del paquete; cualquier
 * otro se deja tal cual para que el manager lo busque en el PATH, en los
 * directorios gestionados o lo instale con su receta.
 *
 * La regla es EXPLÍCITA (el prefijo `./`): adivinar por "tiene una barra"
 * rompería un `command` como `node_modules/.bin/x`, que puede venir del PATH.
 */
export function resolveServerCommand(command: string, extensionPath?: string): string {
  const isRelative = command.startsWith('./') || command.startsWith('../')
  if (!isRelative || !extensionPath) return command
  const base = extensionPath.replace(/[\\/]+$/, '')
  // El tramo `../` se resuelve de verdad: la ruta se normaliza por segmentos
  // (el renderer no tiene `path`, y el main valida igual).
  const segments = `${base}/${command}`.split('/')
  const out: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      out.pop()
      continue
    }
    out.push(segment)
  }
  const joined = out.join('/')
  // Un base POSIX (`/home/u/...`) pierde la barra inicial al partir por `/`:
  // se repone. En Windows (`C:/Users/...`) el primer segmento es la unidad.
  return base.startsWith('/') ? `/${joined}` : joined
}

function toDynamicDef(contribution: LspContribution, extensionPath?: string): DynamicLspServerDef {
  return {
    id: contribution.id,
    command: resolveServerCommand(contribution.command, extensionPath),
    // Los args que apuntan a un archivo del paquete también (`node ./server/x.js`):
    // se resuelven contra el cwd del IDE, no contra la extensión.
    args: contribution.args?.map((arg) => resolveServerCommand(arg, extensionPath)),
    extensions: contribution.extensions,
    rootMarkers: contribution.rootMarkers,
    gatedBy: contribution.gatedBy,
    install: contribution.install,
    initializationOptions: contribution.initializationOptions,
    settings: contribution.settings
  }
}

export async function registerServers(
  extensionId: string,
  contributions: LspContribution[],
  extensionPath?: string
): Promise<string[]> {
  if (!window.api?.lsp || contributions.length === 0) return []
  const res = await window.api.lsp.registerDynamicServers(
    extensionId,
    contributions.map((contribution) => toDynamicDef(contribution, extensionPath))
  )
  return res.registered
}

/** Registra UNA contribución (el main hace merge por sourceId). */
export async function registerServer(
  extensionId: string,
  contribution: LspContribution,
  extensionPath?: string
): Promise<void> {
  await registerServers(extensionId, [contribution], extensionPath)
}

export async function unregisterServers(extensionId: string): Promise<void> {
  await window.api?.lsp?.removeDynamicServers(extensionId)
}

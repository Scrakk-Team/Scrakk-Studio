// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Servicio (renderer) de la API global de `.scrakk`.
 *
 * Es la puerta única para leer/escribir la carpeta de Scrakk (user/project).
 * Cualquier subsistema importa `scrakk` o pide un handle con namespace
 * (`scrakkNamespace('skills', 'project')`) y trabaja relativo a su carpeta,
 * sin armar rutas ni tocar IPC a mano.
 *
 * El proceso main valida y enjaula todo a la raíz; acá solo se agrega la
 * noción de namespace y de proyecto activo.
 */

import type {
  ScrakkChangeEvent,
  ScrakkEntry,
  ScrakkOp,
  ScrakkResult,
  ScrakkRoots,
  ScrakkScope
} from '@shared/scrakk'

/** Raíz del proyecto abierto (la escribe el Explorer). */
export function scrakkProjectRoot(): string | null {
  try {
    return localStorage.getItem('scrakk-studio:root-path') || null
  } catch {
    return null
  }
}

function joinRel(base: string, relative?: string): string {
  const clean = (relative ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!base) return clean
  return clean ? `${base}/${clean}` : base
}

/** Handle de una capa (o de una carpeta dentro de ella). */
export interface ScrakkHandle {
  scope: ScrakkScope
  /** Subcarpeta base dentro de la raíz (ej. `skills`). */
  dir: string
  list(relative?: string): Promise<ScrakkResult<ScrakkEntry[]>>
  read(relative: string): Promise<ScrakkResult<string | null>>
  write(relative: string, content: string): Promise<ScrakkResult<string>>
  readJson(relative: string): Promise<ScrakkResult<Record<string, unknown> | null>>
  writeJson(relative: string, data: Record<string, unknown>): Promise<ScrakkResult<string>>
  remove(relative: string): Promise<ScrakkResult<null>>
  mkdir(relative?: string): Promise<ScrakkResult<string>>
  exists(relative?: string): Promise<boolean>
  stat(relative?: string): Promise<ScrakkResult<ScrakkEntry | null>>
  watch(relative?: string): Promise<ScrakkResult<null>>
  unwatch(relative?: string): Promise<ScrakkResult<null>>
}

/** Crea un handle sobre una capa, opcionalmente anclado a una subcarpeta. */
export function scrakkHandle(scope: ScrakkScope, dir = ''): ScrakkHandle {
  const op = (relative?: string): ScrakkOp => ({
    scope,
    relative: joinRel(dir, relative),
    projectRoot: scope === 'project' ? scrakkProjectRoot() : null
  })

  return {
    scope,
    dir,
    list: (relative) => window.api.scrakk.list(op(relative)),
    read: (relative) => window.api.scrakk.read(op(relative)),
    write: (relative, content) => window.api.scrakk.write({ ...op(relative), content }),
    readJson: (relative) => window.api.scrakk.readJson(op(relative)),
    writeJson: (relative, data) => window.api.scrakk.writeJson({ ...op(relative), data }),
    remove: (relative) => window.api.scrakk.delete(op(relative)),
    mkdir: (relative) => window.api.scrakk.mkdir(op(relative)),
    exists: (relative) => window.api.scrakk.exists(op(relative)),
    stat: (relative) => window.api.scrakk.stat(op(relative)),
    watch: (relative) => window.api.scrakk.watch(op(relative)),
    unwatch: (relative) => window.api.scrakk.unwatch(op(relative))
  }
}

// ── Namespaces (para que cada subsistema tenga su carpeta) ─────────────────

const namespaces = new Map<string, ScrakkHandle>()

/**
 * Registra (idempotente) una carpeta propia dentro de `.scrakk` y devuelve su
 * handle. Ej: `scrakkNamespace('skills', 'project')` → `<root>/.scrakk/skills`.
 */
export function scrakkNamespace(id: string, scope: ScrakkScope, dir = id): ScrakkHandle {
  const key = `${scope}:${dir}`
  let handle = namespaces.get(key)
  if (!handle) {
    handle = scrakkHandle(scope, dir)
    namespaces.set(key, handle)
  }
  return handle
}

/** Handle de un namespace ya registrado (o lo crea con `defaultScope`). */
export function getScrakkNamespace(id: string, defaultScope: ScrakkScope = 'project'): ScrakkHandle {
  for (const [key, handle] of namespaces) {
    if (key.endsWith(`:${id}`) || key === `${defaultScope}:${id}`) return handle
  }
  return scrakkNamespace(id, defaultScope)
}

// ── API de más alto nivel ──────────────────────────────────────────────────

/** Raíces absolutas de la API (user + project). */
export function scrakkRoots(): Promise<ScrakkRoots> {
  return window.api.scrakk.roots(scrakkProjectRoot())
}

/** Suscripción a cambios en cualquier raíz vigilada. */
export function onScrakkChanged(callback: (event: ScrakkChangeEvent) => void): () => void {
  return window.api.scrakk.onChanged(callback)
}

export const scrakk = {
  projectRoot: scrakkProjectRoot,
  roots: scrakkRoots,
  onChanged: onScrakkChanged,
  user: scrakkHandle('user'),
  project: scrakkHandle('project'),
  handle: scrakkHandle,
  namespace: scrakkNamespace
}

export type { ScrakkEntry, ScrakkResult, ScrakkRoots, ScrakkScope, ScrakkChangeEvent }

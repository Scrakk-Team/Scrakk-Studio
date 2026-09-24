// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Módulo compartido (main + preload + renderer) — API global de `.scrakk`.
 *
 * Una sola puerta para TODO lo que vive en la carpeta de Scrakk:
 *  - `user`    → ~/.scrakk        (config/datos del usuario)
 *  - `project` → <root>/.scrakk   (config/datos del proyecto, gana sobre user)
 *
 * Cualquier subsistema (LSP, skills, tools de extensión, preferencias nuevas)
 * consume esta API en vez de armar rutas por su cuenta. El renderer nunca toca
 * el filesystem: todo pasa por el proceso main y queda enjaulado a la raíz.
 */

export const SCRAKK_FS_IPC = {
  roots: 'scrakk:roots',
  list: 'scrakk:list',
  read: 'scrakk:read',
  write: 'scrakk:write',
  delete: 'scrakk:delete',
  mkdir: 'scrakk:mkdir',
  exists: 'scrakk:exists',
  stat: 'scrakk:stat',
  readJson: 'scrakk:read-json',
  writeJson: 'scrakk:write-json',
  watch: 'scrakk:watch',
  unwatch: 'scrakk:unwatch',
  /** Evento main → renderer: algo cambió dentro de una raíz vigilada. */
  changed: 'scrakk:changed'
} as const

/** Capa de la carpeta `.scrakk`. */
export type ScrakkScope = 'user' | 'project'

/** Raíces absolutas. `project` es null si no hay proyecto abierto. */
export interface ScrakkRoots {
  user: string
  project: string | null
}

export interface ScrakkEntry {
  name: string
  /** Ruta relativa a la raíz (siempre con `/`). */
  path: string
  type: 'file' | 'dir'
  size: number
  mtimeMs: number
}

/** Resultado uniforme: nunca se lanza a través del IPC. */
export type ScrakkResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Payload de toda operación: qué capa, qué ruta relativa y de qué proyecto. */
export interface ScrakkOp {
  scope: ScrakkScope
  /** Ruta relativa dentro de la raíz (ej. `skills/mi-skill/SKILL.md`). */
  relative?: string
  /**
   * Raíz del proyecto. Solo hace falta para `scope: 'project'`; el renderer
   * la resuelve una vez y la reenvía (el main no adivina el workspace).
   */
  projectRoot?: string | null
}

export interface ScrakkReadOp extends ScrakkOp {}
export interface ScrakkWriteOp extends ScrakkOp {
  content: string
}
export interface ScrakkWriteJsonOp extends ScrakkOp {
  data: Record<string, unknown>
}

/** Evento de cambio: qué capa cambió y la ruta relativa afectada. */
export interface ScrakkChangeEvent {
  scope: ScrakkScope
  relative: string
}

/** API expuesta por el preload en `window.api.scrakk`. */
export interface ScrakkFsApi {
  roots: (projectRoot?: string | null) => Promise<ScrakkRoots>
  list: (op: ScrakkOp) => Promise<ScrakkResult<ScrakkEntry[]>>
  read: (op: ScrakkReadOp) => Promise<ScrakkResult<string | null>>
  write: (op: ScrakkWriteOp) => Promise<ScrakkResult<string>>
  delete: (op: ScrakkOp) => Promise<ScrakkResult<null>>
  mkdir: (op: ScrakkOp) => Promise<ScrakkResult<string>>
  exists: (op: ScrakkOp) => Promise<boolean>
  stat: (op: ScrakkOp) => Promise<ScrakkResult<ScrakkEntry | null>>
  readJson: (op: ScrakkOp) => Promise<ScrakkResult<Record<string, unknown> | null>>
  writeJson: (op: ScrakkWriteJsonOp) => Promise<ScrakkResult<string>>
  watch: (op: ScrakkOp) => Promise<ScrakkResult<null>>
  unwatch: (op: ScrakkOp) => Promise<ScrakkResult<null>>
  onChanged: (callback: (event: ScrakkChangeEvent) => void) => () => void
}

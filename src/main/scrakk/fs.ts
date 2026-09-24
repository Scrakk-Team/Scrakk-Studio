// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * API de archivos de `.scrakk` (proceso main).
 *
 * Operaciones CRUD enjauladas a la raíz de la capa (user/project): toda ruta
 * relativa se resuelve y se verifica que NO escape con `..` o symlinks. Es la
 * única implementación de rutas; los subsistemas consumen esto por IPC.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { watch as fsWatch, type FSWatcher } from 'node:fs'
import type { WebContents } from 'electron'
import { projectScrakkDir, scrakkHome } from '../scrakkFolder'
import type {
  ScrakkEntry,
  ScrakkOp,
  ScrakkResult,
  ScrakkRoots,
  ScrakkScope
} from '@shared/scrakk'

function ok<T>(data: T): ScrakkResult<T> {
  return { ok: true, data }
}
function fail<T>(error: string): ScrakkResult<T> {
  return { ok: false, error }
}

/** Raíces absolutas de la capa pedida. */
export function rootsOf(projectRoot?: string | null): ScrakkRoots {
  return {
    user: scrakkHome(),
    project: projectRoot ? projectScrakkDir(projectRoot) : null
  }
}

/** Resuelve la raíz de una capa (o error si es `project` sin root). */
function rootFor(scope: ScrakkScope, projectRoot?: string | null): string | null {
  if (scope === 'user') return scrakkHome()
  if (!projectRoot) return null
  return projectScrakkDir(projectRoot)
}

/** Normaliza una ruta relativa (acepta `\`, quita `./`, colapsa duplicados). */
function normalizeRelative(relative?: string): string {
  return (relative ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .trim()
}

/**
 * Resuelve `relative` dentro de `root` y garantiza que no escape hacia afuera.
 * Devuelve la ruta absoluta o null si es inválida.
 */
function resolveInside(root: string, relative?: string): string | null {
  const rel = normalizeRelative(relative)
  const abs = path.resolve(root, rel)
  const base = path.resolve(root)
  if (abs !== base && !abs.startsWith(base + path.sep)) return null
  return abs
}

function toEntry(root: string, abs: string, isDir: boolean, size: number, mtimeMs: number): ScrakkEntry {
  const rel = path.relative(root, abs).split(path.sep).join('/')
  return { name: path.basename(abs), path: rel, type: isDir ? 'dir' : 'file', size, mtimeMs }
}

// ── Operaciones ────────────────────────────────────────────────────────────

export async function listEntries(op: ScrakkOp): Promise<ScrakkResult<ScrakkEntry[]>> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return fail('No hay proyecto abierto')
  const abs = resolveInside(root, op.relative)
  if (!abs) return fail('Ruta fuera de .scrakk')
  try {
    const dirents = await fs.readdir(abs, { withFileTypes: true })
    const entries: ScrakkEntry[] = []
    for (const dirent of dirents) {
      const child = path.join(abs, dirent.name)
      let size = 0
      let mtimeMs = 0
      try {
        const st = await fs.stat(child)
        size = st.size
        mtimeMs = st.mtimeMs
      } catch {
        continue
      }
      entries.push(toEntry(root, child, dirent.isDirectory(), size, mtimeMs))
    }
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
    return ok(entries)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return ok([])
    return fail(String((error as Error).message ?? error))
  }
}

export async function readText(op: ScrakkOp): Promise<ScrakkResult<string | null>> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return fail('No hay proyecto abierto')
  const abs = resolveInside(root, op.relative)
  if (!abs) return fail('Ruta fuera de .scrakk')
  try {
    return ok(await fs.readFile(abs, 'utf-8'))
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT' || code === 'EISDIR') return ok(null)
    return fail(String((error as Error).message ?? error))
  }
}

export async function writeText(op: ScrakkOp & { content: string }): Promise<ScrakkResult<string>> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return fail('No hay proyecto abierto')
  const abs = resolveInside(root, op.relative)
  if (!abs || abs === path.resolve(root)) return fail('Ruta inválida')
  try {
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, op.content, 'utf-8')
    return ok(abs)
  } catch (error) {
    return fail(String((error as Error).message ?? error))
  }
}

export async function readJson(op: ScrakkOp): Promise<ScrakkResult<Record<string, unknown> | null>> {
  const raw = await readText(op)
  if (!raw.ok) return raw
  if (raw.data === null) return ok(null)
  try {
    const parsed: unknown = JSON.parse(raw.data)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ok(null)
    return ok(parsed as Record<string, unknown>)
  } catch {
    return ok(null)
  }
}

export async function writeJson(op: ScrakkOp & { data: Record<string, unknown> }): Promise<ScrakkResult<string>> {
  return writeText({ ...op, content: JSON.stringify(op.data, null, 2) + '\n' })
}

export async function removeEntry(op: ScrakkOp): Promise<ScrakkResult<null>> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return fail('No hay proyecto abierto')
  const abs = resolveInside(root, op.relative)
  if (!abs || abs === path.resolve(root)) return fail('Ruta inválida')
  try {
    await fs.rm(abs, { recursive: true, force: true })
    return ok(null)
  } catch (error) {
    return fail(String((error as Error).message ?? error))
  }
}

export async function makeDir(op: ScrakkOp): Promise<ScrakkResult<string>> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return fail('No hay proyecto abierto')
  const abs = resolveInside(root, op.relative)
  if (!abs) return fail('Ruta fuera de .scrakk')
  try {
    await fs.mkdir(abs, { recursive: true })
    return ok(abs)
  } catch (error) {
    return fail(String((error as Error).message ?? error))
  }
}

export async function entryExists(op: ScrakkOp): Promise<boolean> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return false
  const abs = resolveInside(root, op.relative)
  if (!abs) return false
  try {
    await fs.access(abs)
    return true
  } catch {
    return false
  }
}

export async function statEntry(op: ScrakkOp): Promise<ScrakkResult<ScrakkEntry | null>> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return fail('No hay proyecto abierto')
  const abs = resolveInside(root, op.relative)
  if (!abs) return fail('Ruta fuera de .scrakk')
  try {
    const st = await fs.stat(abs)
    return ok(toEntry(root, abs, st.isDirectory(), st.size, st.mtimeMs))
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return ok(null)
    return fail(String((error as Error).message ?? error))
  }
}

// ── Watchers ───────────────────────────────────────────────────────────────

interface WatchEntry {
  watcher: FSWatcher
  sender: WebContents
  scope: ScrakkScope
  root: string
  dir: string
  timer?: NodeJS.Timeout
}

const watchers = new Map<string, WatchEntry>()

function watchKey(senderId: number, dir: string): string {
  return `${senderId}:${dir}`
}

/** Empieza a vigilar un directorio dentro de una raíz (idempotente). */
export function watchDir(
  sender: WebContents,
  op: ScrakkOp,
  onEvent: (sender: WebContents, event: { scope: ScrakkScope; relative: string }) => void
): ScrakkResult<null> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return fail('No hay proyecto abierto')
  const dir = resolveInside(root, op.relative)
  if (!dir) return fail('Ruta fuera de .scrakk')
  const key = watchKey(sender.id, dir)
  if (watchers.has(key)) return ok(null)
  try {
    const watcher = fsWatch(dir, { persistent: false }, () => {
      const entry = watchers.get(key)
      if (!entry) return
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = setTimeout(() => {
        const relative = path.relative(entry.root, entry.dir).split(path.sep).join('/')
        onEvent(entry.sender, { scope: entry.scope, relative })
      }, 80)
    })
    watcher.on('error', () => {
      // El directorio puede desaparecer: se descarta el watcher en silencio.
      watchers.get(key)?.watcher.close()
      watchers.delete(key)
    })
    watchers.set(key, { watcher, sender, scope: op.scope, root, dir })
    return ok(null)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return ok(null)
    return fail(String((error as Error).message ?? error))
  }
}

export function unwatchDir(sender: WebContents, op: ScrakkOp): ScrakkResult<null> {
  const root = rootFor(op.scope, op.projectRoot)
  if (!root) return ok(null)
  const dir = resolveInside(root, op.relative)
  if (!dir) return ok(null)
  const key = watchKey(sender.id, dir)
  const entry = watchers.get(key)
  if (!entry) return ok(null)
  if (entry.timer) clearTimeout(entry.timer)
  entry.watcher.close()
  watchers.delete(key)
  return ok(null)
}

/** Cierra los watchers de un webContents que se destruyó. */
export function disposeWatchersFor(senderId: number): void {
  for (const [key, entry] of watchers) {
    if (entry.sender.id !== senderId) continue
    if (entry.timer) clearTimeout(entry.timer)
    entry.watcher.close()
    watchers.delete(key)
  }
}

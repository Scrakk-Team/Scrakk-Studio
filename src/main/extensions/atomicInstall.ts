// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Instalación atómica de paquetes de extensión.
 *
 * El patrón viejo borraba el destino y escribía encima: un ZIP truncado, disco
 * lleno o un `EPERM` en Windows dejaba al usuario sin la versión anterior y con
 * una carpeta a medio escribir.
 *
 * Orden: stage (dentro del mismo filesystem) → escribir/validar → swap por
 * `rename` → limpiar backup. Si algo falla antes del swap, el destino no se
 * toca. Si falla el segundo rename, se restaura el backup.
 *
 * Sin dependencia de Electron: se testea contra un filesystem real.
 */

import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export type AtomicEntry = string | Uint8Array

export interface AtomicInstallOptions {
  /** Directorio de extensiones (mismo filesystem que el destino). */
  root: string
  /** Id de la extensión; también es el nombre del directorio destino. */
  id: string
  files: Iterable<[string, AtomicEntry]>
  /** Sidecars que deben entrar en la misma unidad atómica (`.source.json`…). */
  extraFiles?: Record<string, AtomicEntry>
}

export interface AtomicInstallResult {
  targetDir: string
  written: number
}

function safeEntry(entry: string): string | null {
  if (!entry || entry.includes('\0')) return null
  const normalized = entry.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return null
  if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('//')) return null
  if (normalized.split('/').some((part) => part === '..')) return null
  return normalized.replace(/^\.\/+/, '')
}

function inside(base: string, target: string): boolean {
  const root = path.resolve(base)
  const abs = path.resolve(target)
  return abs !== root && abs.startsWith(root + path.sep)
}

async function writeEntry(
  staging: string,
  relative: string,
  data: AtomicEntry
): Promise<boolean> {
  const safe = safeEntry(relative)
  if (!safe) return false
  const target = path.join(staging, safe)
  if (!inside(staging, target)) return false
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, data)
  return true
}

/**
 * Instala o actualiza `root/id` de forma atómica. Lanza en error; el destino
 * anterior queda intacto salvo que el swap ya haya ocurrido.
 */
export async function atomicInstall(options: AtomicInstallOptions): Promise<AtomicInstallResult> {
  if (!SAFE_ID.test(options.id)) throw new Error(`Id de extensión inválido: "${options.id}"`)
  const root = path.resolve(options.root)
  const target = path.join(root, options.id)
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const staging = path.join(root, `.staging-${options.id}-${stamp}`)
  const backup = path.join(root, `.backup-${options.id}-${stamp}`)
  let written = 0

  await fs.mkdir(root, { recursive: true })
  try {
    await fs.mkdir(staging, { recursive: true })

    for (const [relative, data] of options.files) {
      if (await writeEntry(staging, relative, data)) written++
    }
    for (const [relative, data] of Object.entries(options.extraFiles ?? {})) {
      if (await writeEntry(staging, relative, data)) written++
    }
    // Un paquete sin archivos no debe reemplazar una instalación válida.
    if (written === 0) throw new Error('El paquete no contiene archivos')

    let movedOld = false
    try {
      await fs.rename(target, backup)
      movedOld = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    try {
      await fs.rename(staging, target)
    } catch (error) {
      if (movedOld) {
        // Rollback: devolver la versión anterior a su lugar.
        await fs.rename(backup, target).catch(() => undefined)
      }
      throw error
    }

    if (movedOld) {
      // Si Windows tiene un handle abierto, el backup se limpia en el próximo
      // arranque (`cleanupStaleInstalls`).
      await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined)
    }
    return { targetDir: target, written }
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Limpia restos de instalaciones interrumpidas. Se llama una vez al arrancar;
 * `maxAgeMs = 0` borra todo lo que quedó de una sesión anterior.
 */
export async function cleanupStaleInstalls(root: string, maxAgeMs = 0): Promise<number> {
  let removed = 0
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return 0
  }
  const now = Date.now()
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!/^\.(staging|backup)-/.test(entry.name)) continue
    const full = path.join(root, entry.name)
    try {
      const stat = await fs.stat(full)
      if (maxAgeMs > 0 && now - stat.mtimeMs < maxAgeMs) continue

      // Un backup con el destino ausente significa que el swap quedó a medias:
      // restaurarlo es más seguro que borrarlo.
      const backup = /^\.backup-(.+)-\d+-[0-9a-f]{8}$/.exec(entry.name)
      if (backup) {
        const target = path.join(root, backup[1])
        try {
          await fs.access(target)
        } catch {
          await fs.rename(full, target)
          removed++
          continue
        }
      }

      await fs.rm(full, { recursive: true, force: true })
      removed++
    } catch {
      // Otro proceso lo está usando: se reintenta en el próximo arranque.
    }
  }
  return removed
}

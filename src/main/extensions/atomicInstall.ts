// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Instalación ATÓMICA de un paquete de extensión.
 *
 * Existe porque el patrón anterior —borrar el directorio destino y LUEGO escribir
 * el contenido— convierte cualquier fallo intermedio (zip truncado, disco lleno,
 * `EPERM` de Windows con un archivo abierto) en la pérdida de una extensión que
 * funcionaba, sustituida por otra a medias.
 *
 * Módulo aparte, sin `electron` a propósito: la lógica de swap es lo que hay que
 * probar (contra un filesystem real, con errores reales), y atarla al registro de
 * handlers la haría intestable sin levantar la app entera.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { randomBytes } from 'node:crypto'

const STAGING_PREFIX = '.staging-'
const BACKUP_PREFIX = '.backup-'

/** Sello único por intento: dos instalaciones simultáneas no colisionan. */
function attemptStamp(id: string): string {
  return `${id}-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`
}

/** `relative` resuelto dentro de `dir`, o null si escapa (fail-closed). */
export function resolveInsideDir(dir: string, relative: string): string | null {
  const base = path.resolve(dir)
  const target = path.resolve(base, relative)
  if (target !== base && !target.startsWith(base + path.sep)) return null
  return target
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

/**
 * Limpia restos de una instalación que murió a mitad (crash, cierre forzado).
 *
 * Un `.staging-*` o `.backup-*` huérfano no rompe nada —quien lista las
 * extensiones ignora las carpetas sin manifest— pero acumula disco y ocupa sitio
 * en el directorio de extensiones. Se ejecuta al registrar los handlers, antes
 * de que el renderer pueda pedir la lista.
 */
export async function cleanupStaleInstalls(root: string): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(root)
  } catch {
    return
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith(STAGING_PREFIX) || name.startsWith(BACKUP_PREFIX))
      .map((name) => fs.rm(path.join(root, name), { recursive: true, force: true }).catch(() => {}))
  )
}

export interface AtomicInstallParams {
  /** `extensionsRoot()`. */
  root: string
  /** Id de la extensión (ya validado por el llamador). */
  id: string
  /** Archivos del paquete, relativos a la raíz del paquete. */
  files: ReadonlyMap<string, Uint8Array | string>
  /**
   * Sidecar de procedencia. Se escribe DENTRO del staging para que forme parte
   * de la unidad atómica: si el swap falla, no queda un `.source.json` de la
   * versión nueva apoyado sobre los archivos de la vieja.
   */
  sidecar?: (stagingDir: string) => Promise<void>
}

/**
 * Instala un paquete de extensión de forma ATÓMICA y devuelve el directorio
 * final. Lanza si la instalación no se pudo completar, dejando el estado previo
 * intacto.
 *
 * ## Orden
 *
 * staging → validar rutas → escribir → sidecar → swap → limpiar backup
 *
 * ## Garantías y límites reales
 *
 * - **El staging va DENTRO de `root`**, nunca a `os.tmpdir()`: `rename` sólo es
 *   atómico dentro del mismo filesystem, y entre volúmenes falla con `EXDEV`.
 * - **El swap es `rename`, no delete+copy.** En POSIX es atómico.
 * - **En Windows `rename` falla si el destino existe**, de ahí el paso intermedio
 *   a `backup`: destino → backup, staging → destino.
 * - **Si falla el segundo rename**, el backup se restaura y la extensión que
 *   funcionaba vuelve a su sitio.
 * - **Windows puede rechazar el rename del destino** (`EPERM`/`EBUSY`) si el
 *   extension host tiene abierto un archivo suyo, un `.node` por ejemplo. La
 *   instalación falla y NO se toca nada. Es deliberado: un error visible es mejor
 *   que una instalación rota.
 * - Las entradas del paquete que escapan del directorio se **omiten**; el resto
 *   del paquete se instala igual, en lugar de abortar la instalación entera.
 */
export async function installExtensionAtomically(params: AtomicInstallParams): Promise<string> {
  const { root, id, files, sidecar } = params
  const targetDir = path.join(root, id)
  const stagingDir = path.join(root, `${STAGING_PREFIX}${attemptStamp(id)}`)
  const backupDir = path.join(root, `${BACKUP_PREFIX}${attemptStamp(id)}`)

  let swapped = false
  try {
    await fs.mkdir(stagingDir, { recursive: true })

    let written = 0
    for (const [relative, data] of files) {
      const target = resolveInsideDir(stagingDir, relative)
      if (!target) continue
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, data)
      written++
    }

    // Un paquete del que no queda NADA no es una instalación: sin este chequeo,
    // un `files` vacío (o cuyas entradas son todas trayectorias que escapan)
    // completaría el swap y dejaría el destino vacío, destruyendo la extensión
    // que hubiera hubo. Los llamadores ya validan esto (`parseSef` rechaza un
    // .sef vacío), pero el helper no debe depender de que su llamador se acuerde.
    if (written === 0) throw new Error('el paquete no contiene archivos instalables')

    if (sidecar) await sidecar(stagingDir)

    // ── Swap ──
    const hadPrevious = await exists(targetDir)
    if (hadPrevious) {
      await fs.rename(targetDir, backupDir)
    }
    try {
      await fs.rename(stagingDir, targetDir)
    } catch (error) {
      // La versión nueva no entró: devolver la que sí funcionaba.
      if (hadPrevious) await fs.rename(backupDir, targetDir).catch(() => {})
      throw error
    }
    swapped = true

    if (hadPrevious) {
      // La nueva ya está en su sitio; el backup es basura. Si este `rm` falla
      // (archivo tomado en Windows) NO deshace la instalación: lo limpia
      // `cleanupStaleInstalls` en el próximo arranque.
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {})
    }
    return targetDir
  } finally {
    // Cualquier fallo antes del swap: fuera el staging, intacto el destino.
    if (!swapped) {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
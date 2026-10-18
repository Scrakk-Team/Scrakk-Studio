// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sandbox del Extension Host con el modelo de permisos de Node.
 *
 * Electron 44 trae Node 24, donde `--permission` es estable y bloquea
 * filesystem y `child_process` a nivel runtime (no es un parche de módulos que
 * se pueda saltar con `process.binding`). El host arranca con `execArgv`
 * derivado del manifest:
 *
 *  - lectura: app, entry del host, paquete, storage y workspace (si `fs.read`);
 *  - escritura: storage y workspace (si `fs.write`/`fs.all`);
 *  - `child_process`: solo si declara `shell.exec`;
 *  - addons/WASI: bloqueados (una extensión no puede cargar un `.node`).
 *
 * La red NO la cubre el modelo de permisos de Node; eso requiere sandbox del
 * SO (fase posterior) o el permiso `network.fetch` como declaración.
 */

import * as os from 'node:os'
import * as path from 'node:path'
import type { ExtensionStoragePaths } from '@shared/extensionHost/protocol'

export type SandboxDriver = 'node-permission' | 'none'

export interface SandboxPolicyInput {
  extensionPath: string
  workspaceRoots: readonly string[]
  storage: ExtensionStoragePaths
  permissions: readonly string[]
  /** `app.getAppPath()` (asar o checkout). */
  appRoot: string
  /** Ruta real del entry del host (`hostEntryPath()`). */
  hostEntry: string
  /** `process.resourcesPath` (asar.unpacked, nativos). */
  resourcesPath?: string
  homeDir?: string
  /** Permite desactivarlo por entorno (compatibilidad/diagnóstico). */
  enabled?: boolean
}

export interface SandboxPolicy {
  driver: SandboxDriver
  execArgv: string[]
  /** Rutas que el host puede leer/escribir (las usa el sandbox del SO). */
  readPaths: string[]
  writePaths: string[]
  /** Razón del fallback cuando `driver === 'none'`. */
  reason?: string
}

/** ¿El runtime actual soporta `--permission`? (Node 22.13+/24). */
export function supportsPermissionModel(
  flags: ReadonlySet<string> = process.allowedNodeEnvironmentFlags
): boolean {
  return flags.has('--permission')
}

function unique(paths: ReadonlyArray<string | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of paths) {
    if (!value) continue
    const abs = path.resolve(value)
    if (seen.has(abs)) continue
    seen.add(abs)
    out.push(abs)
  }
  return out
}

/**
 * Construye los `execArgv` del host. Puro y testeable: no toca Electron.
 */
export function buildSandboxPolicy(input: SandboxPolicyInput): SandboxPolicy {
  const has = (permission: string): boolean => input.permissions.includes(permission)
  const readAll = has('fs.all')
  const readWorkspace = readAll || has('fs.read')
  const writeWorkspace = readAll || has('fs.write')
  const canSpawn = has('shell.exec')

  const read = unique([
    input.appRoot,
    path.dirname(input.appRoot),
    input.hostEntry,
    path.dirname(input.hostEntry),
    input.resourcesPath,
    input.extensionPath,
    input.storage.globalStorage,
    input.storage.workspaceStorage,
    input.storage.logs,
    os.tmpdir(),
    ...(readWorkspace ? input.workspaceRoots : []),
    ...(readAll ? [input.homeDir] : [])
  ])
  const write = unique([
    input.storage.globalStorage,
    input.storage.workspaceStorage,
    input.storage.logs,
    os.tmpdir(),
    ...(writeWorkspace ? input.workspaceRoots : []),
    ...(readAll ? [input.homeDir] : [])
  ])

  if (input.enabled === false) {
    return {
      driver: 'none',
      execArgv: [],
      readPaths: read,
      writePaths: write,
      reason: 'deshabilitado por SCRAKK_DISABLE_EXTENSION_SANDBOX'
    }
  }
  if (!supportsPermissionModel()) {
    return {
      driver: 'none',
      execArgv: [],
      readPaths: read,
      writePaths: write,
      reason: 'el runtime no soporta --permission'
    }
  }

  const execArgv = [
    '--permission',
    // Solo lectura del store de CAs del sistema (TLS de las extensiones).
    // Node advierte que es sensible; se limita a leer CAs, no a escribir.
    '--allow-openssl-store',
    ...read.map((dir) => `--allow-fs-read=${dir}`),
    ...write.map((dir) => `--allow-fs-write=${dir}`),
    ...(canSpawn ? ['--allow-child-process'] : [])
  ]
  return { driver: 'node-permission', execArgv, readPaths: read, writePaths: write }
}

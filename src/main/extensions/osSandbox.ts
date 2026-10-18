// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sandbox de red del Extension Host con bubblewrap (Linux).
 *
 * El modelo de permisos de Node cubre filesystem y `child_process`, pero no
 * sockets. En Linux, si la extensión NO declara `network.fetch`, el host se
 * lanza dentro de `bwrap --unshare-net`: un network namespace sin salida (solo
 * loopback). Las rutas de escritura se re-bindean rw; el resto queda read-only.
 *
 * Windows/macOS no tienen un equivalente portátil: ahí la red sigue abierta y
 * el modelo de Node solo limita fs/child_process. Se reporta como residual.
 */

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export interface OsSandbox {
  driver: 'bwrap'
  file: string
  /** Argumentos ANTES del ejecutable del host. */
  args: string[]
}

let cachedBwrap: string | null | undefined

/** Busca `bwrap` y comprueba que los user namespaces funcionen. */
export function findBwrap(): string | null {
  if (cachedBwrap !== undefined) return cachedBwrap
  const version = spawnSync('bwrap', ['--version'], { encoding: 'utf-8', timeout: 3000 })
  if (version.status !== 0) {
    cachedBwrap = null
    return cachedBwrap
  }
  // El probe real: si el kernel no permite unshare, bwrap falla al ejecutar.
  const probe = spawnSync(
    'bwrap',
    ['--unshare-net', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', 'true'],
    { encoding: 'utf-8', timeout: 5000 }
  )
  cachedBwrap = probe.status === 0 ? 'bwrap' : null
  return cachedBwrap
}

export interface NetworkSandboxInput {
  /** false si la extensión declara `network.fetch`. */
  enabled: boolean
  writePaths: readonly string[]
  platform?: NodeJS.Platform
  /** Inyectable en tests; por defecto busca bwrap en PATH. */
  bwrap?: string | null
}

/**
 * Construye el wrapper de bwrap. Devuelve null si no aplica o no está
 * disponible: en ese caso el host arranca sin aislamiento de red (no se
 * rompe la extensión).
 */
export function buildNetworkSandbox(input: NetworkSandboxInput): OsSandbox | null {
  const platform = input.platform ?? process.platform
  if (!input.enabled || platform !== 'linux') return null
  const bwrap = input.bwrap === undefined ? findBwrap() : input.bwrap
  if (!bwrap) return null

  const args = [
    '--unshare-net',
    '--die-with-parent',
    '--ro-bind',
    '/',
    '/',
    '--dev',
    '/dev',
    '--proc',
    '/proc'
  ]
  for (const dir of input.writePaths) {
    if (existsSync(dir)) args.push('--bind', dir, dir)
  }
  return { driver: 'bwrap', file: bwrap, args }
}

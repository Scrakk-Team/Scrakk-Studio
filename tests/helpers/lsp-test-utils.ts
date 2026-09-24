// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Helpers compartidos de tests LSP.
 */

import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import * as path from 'path'

export async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

export async function cleanupDir(dir: string | undefined): Promise<void> {
  if (!dir) return
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

/** Poll hasta que la condición sea true (o timeout). */
export async function waitFor<T>(
  fn: () => T | undefined | null | false,
  timeoutMs = 10_000,
  intervalMs = 25
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = fn()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`waitFor: condición no cumplida en ${timeoutMs}ms`)
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Git — cliente tipado sobre window.api.git (puente preload → main).
 *
 * Fino a propósito: validación y argv viven en main; aquí solo tipado y
 * guard para entornos sin puente (web/dev) con el mismo shape de error.
 */

import type { GitApi, GitResult } from '@shared/git'

function noBridge<T>(): GitResult<T> {
  return { ok: false, error: { code: 'failed', message: 'Puente nativo no disponible' } }
}

function bridge(): GitApi | null {
  try {
    return typeof window !== 'undefined' ? (window.api?.git ?? null) : null
  } catch {
    return null
  }
}

type Unwrap<T> = T extends Promise<infer U> ? U : never

async function call<K extends keyof GitApi>(
  method: K,
  ...args: Parameters<GitApi[K]>
): Promise<Unwrap<ReturnType<GitApi[K]>>> {
  const api = bridge()
  if (!api) return noBridge() as Unwrap<ReturnType<GitApi[K]>>
  const fn = api[method] as (...a: Parameters<GitApi[K]>) => Promise<Unwrap<ReturnType<GitApi[K]>>>
  try {
    return await fn(...args)
  } catch (error) {
    return {
      ok: false,
      error: { code: 'failed', message: error instanceof Error ? error.message : String(error) }
    } as Unwrap<ReturnType<GitApi[K]>>
  }
}

type AnyFn = (...args: any[]) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any

export const gitApi: GitApi = new Proxy({} as GitApi, {
  get:
    (_target, method: string) =>
    (...args: unknown[]) =>
      (call as AnyFn)(method, ...args)
})

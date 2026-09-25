// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Duración mínima de un loader: sin esto, una operación instantánea hace
 * parpadear el feedback. El helper no debe agregar espera cuando el trabajo
 * ya es más lento que el mínimo.
 */

import { describe, expect, it } from 'vitest'
import { MIN_LOADING_MS, withMinLoading } from '../src/renderer/src/core/feedback'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('withMinLoading', () => {
  it('respeta el mínimo cuando el trabajo termina antes', async () => {
    const start = Date.now()
    const result = await withMinLoading(delay(0).then(() => 'ok'), 60)
    expect(result).toBe('ok')
    expect(Date.now() - start).toBeGreaterThanOrEqual(55)
  })

  it('NO agrega espera cuando el trabajo ya supera el mínimo', async () => {
    const start = Date.now()
    await withMinLoading(delay(50).then(() => 7), 10)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(45)
    expect(elapsed).toBeLessThan(120)
  })

  it('propaga valor y rechazo sin demorar el error', async () => {
    await expect(withMinLoading(Promise.resolve('v'), 1)).resolves.toBe('v')
    await expect(withMinLoading(Promise.reject(new Error('boom')), 1)).rejects.toThrow('boom')
  })

  it('el mínimo centralizado es el esperado por la UI', () => {
    expect(MIN_LOADING_MS).toBeGreaterThanOrEqual(250)
  })
})

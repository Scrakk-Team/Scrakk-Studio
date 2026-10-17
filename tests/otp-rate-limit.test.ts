// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El OTP se pide contra una API externa. El cliente pone su propia barrera
 * para email bombing / fuerza bruta de 6 dígitos.
 */

import { describe, it, expect } from 'vitest'
import { AttemptLimiter } from '../src/main/account/rateLimit'

function clock(start = 1_000_000) {
  let now = start
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    }
  }
}

describe('AttemptLimiter', () => {
  it('permite hasta el límite y luego rechaza con retryAfter', () => {
    const c = clock()
    const limiter = new AttemptLimiter(c.now)
    expect(limiter.hit('k', 2, 60_000).allowed).toBe(true)
    c.advance(1_000)
    expect(limiter.hit('k', 2, 60_000).allowed).toBe(true)

    const blocked = limiter.hit('k', 2, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(59_000)
  })

  it('libera slots al pasar la ventana', () => {
    const c = clock()
    const limiter = new AttemptLimiter(c.now)
    limiter.hit('k', 1, 60_000)
    expect(limiter.hit('k', 1, 60_000).allowed).toBe(false)
    c.advance(60_001)
    expect(limiter.hit('k', 1, 60_000).allowed).toBe(true)
  })

  it('separa claves y respeta reset', () => {
    const c = clock()
    const limiter = new AttemptLimiter(c.now)
    limiter.hit('a', 1, 1_000)
    expect(limiter.hit('b', 1, 1_000).allowed).toBe(true)
    limiter.reset('a')
    expect(limiter.hit('a', 1, 1_000).allowed).toBe(true)
  })
})

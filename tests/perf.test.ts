// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del contrato portable de performance (src/shared/perf.ts).
 *
 * Cubre:
 *  - resolvePerfProfile (override, NODE_ENV, fallback dev)
 *  - readEnvFlag (con globalThis.__env__ para no tocar process)
 *  - measure / measureAsync
 *  - ring buffer de timings (snapshot, reset, overflow)
 *  - getMainHeapCapMb, getWatchCoalesceMs (con env y defaults)
 *  - PERF_DEFAULTS (asume que el plan vive en disco, no se valida acá)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  PERF_DEFAULTS,
  getMainHeapCapMb,
  getWatchCoalesceMs,
  measure,
  measureAsync,
  readEnvFlag,
  recordTiming,
  resetTimings,
  resolvePerfProfile,
  snapshotTimings
} from '../src/shared/perf'

/**
 * Helper: setea un env temporal para un bloque y lo limpia.
 * Usa globalThis.__env__ porque `process` no existe en sandbox de tests
 * de vitest cuando no se incluye @types/node en el test.
 */
function withEnv(record: Record<string, string | undefined>, fn: () => void): void {
  const g = globalThis as { __env__?: Record<string, string | undefined> }
  const prev = g.__env__
  const next: Record<string, string | undefined> = { ...(prev ?? {}) }
  for (const [k, v] of Object.entries(record)) {
    if (v === undefined) delete next[k]
    else next[k] = v
  }
  g.__env__ = next
  try {
    fn()
  } finally {
    g.__env__ = prev
  }
}

describe('resolvePerfProfile', () => {
  it('override gana sobre env', () => {
    withEnv({ NODE_ENV: 'development' }, () => {
      expect(resolvePerfProfile('prod')).toBe('prod')
      expect(resolvePerfProfile('dev')).toBe('dev')
    })
  })

  it('NODE_ENV=production → prod', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      expect(resolvePerfProfile()).toBe('prod')
    })
  })

  it('sin env → dev', () => {
    withEnv({ NODE_ENV: undefined }, () => {
      expect(resolvePerfProfile()).toBe('dev')
    })
  })
})

describe('readEnvFlag', () => {
  beforeEach(() => {
    withEnv({}, () => undefined) // reset noop, solo para documentar
  })

  it('devuelve default si no hay env', () => {
    withEnv({ SCRAKK_PERF_LOG_STARTUP: undefined }, () => {
      expect(readEnvFlag('logStartup')).toBe(PERF_DEFAULTS.logStartup)
    })
  })

  it('acepta 1/true/yes/on case-insensitive', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'YES', 'on']) {
      withEnv({ SCRAKK_PERF_LOG_STARTUP: v }, () => {
        expect(readEnvFlag('logStartup')).toBe(true)
      })
    }
  })

  it('rechaza 0/false/no/off y basura', () => {
    for (const v of ['0', 'false', 'no', 'off', 'garbage']) {
      withEnv({ SCRAKK_PERF_LOG_STARTUP: v }, () => {
        expect(readEnvFlag('logStartup')).toBe(false)
      })
    }
  })
})

describe('measure / measureAsync', () => {
  it('mide sync y registra duración > 0', () => {
    resetTimings()
    const result = measure('test.sync', () => {
      let s = 0
      for (let i = 0; i < 1000; i++) s += i
      return s
    })
    expect(result).toBe(499500)
    const snap = snapshotTimings()
    const last = snap[snap.length - 1]
    expect(last?.name).toBe('test.sync')
    expect(last?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('mide async', async () => {
    resetTimings()
    const r = await measureAsync('test.async', async () => {
      await new Promise((res) => setTimeout(res, 5))
      return 42
    })
    expect(r).toBe(42)
    const last = snapshotTimings().at(-1)
    expect(last?.name).toBe('test.async')
    expect(last?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('marca error en meta si la función tira', () => {
    resetTimings()
    expect(() =>
      measure('test.throw', () => {
        throw new Error('boom')
      })
    ).toThrow('boom')
    const last = snapshotTimings().at(-1)
    expect(last?.meta?.['error']).toBe(true)
  })
})

describe('recordTiming / snapshotTimings / resetTimings', () => {
  it('ring buffer respeta el límite', () => {
    resetTimings()
    for (let i = 0; i < 600; i++) {
      recordTiming({
        name: `t.${i}`,
        startMs: 0,
        durationMs: 1
      })
    }
    const snap = snapshotTimings()
    expect(snap.length).toBeLessThanOrEqual(500)
    // El más viejo visible debería ser t.100 (overflow de 100)
    expect(snap[0]?.name).toBe('t.100')
  })

  it('reset vacía el buffer', () => {
    recordTiming({ name: 'x', startMs: 0, durationMs: 1 })
    resetTimings()
    expect(snapshotTimings().length).toBe(0)
  })
})

describe('getMainHeapCapMb / getWatchCoalesceMs', () => {
  it('heap cap default = 256', () => {
    withEnv({ SCRAKK_PERF_HEAP_CAP_MB: undefined }, () => {
      expect(getMainHeapCapMb()).toBe(256)
    })
  })

  it('heap cap respeta env', () => {
    withEnv({ SCRAKK_PERF_HEAP_CAP_MB: '512' }, () => {
      expect(getMainHeapCapMb()).toBe(512)
    })
  })

  it('heap cap rechaza valores inválidos → 256', () => {
    withEnv({ SCRAKK_PERF_HEAP_CAP_MB: 'not-a-number' }, () => {
      expect(getMainHeapCapMb()).toBe(256)
    })
  })

  it('watch coalesce default = 50', () => {
    withEnv({ SCRAKK_PERF_WATCH_DEBOUNCE_MS: undefined }, () => {
      expect(getWatchCoalesceMs()).toBe(50)
    })
  })

  it('watch coalesce 0 permitido (no debounce)', () => {
    withEnv({ SCRAKK_PERF_WATCH_DEBOUNCE_MS: '0' }, () => {
      expect(getWatchCoalesceMs()).toBe(0)
    })
  })
})

describe('PERF_DEFAULTS', () => {
  it('defaults razonables para prod', () => {
    expect(PERF_DEFAULTS.dropConsoleInProd).toBe(true)
    expect(PERF_DEFAULTS.manualChunks).toBe(true)
    expect(PERF_DEFAULTS.compressWasm).toBe(true)
  })

  it('defaults seguros para dev (no instrumentation por default)', () => {
    expect(PERF_DEFAULTS.wdyr).toBe(false)
    expect(PERF_DEFAULTS.logStartup).toBe(false)
    expect(PERF_DEFAULTS.logLongTasks).toBe(false)
  })
})

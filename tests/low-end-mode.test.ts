/**
 * Modo PC mala (Fase 6): store + tope de background reducido + recorte
 * inmediato al activar.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readEncoded: vi.fn(),
  notify: vi.fn(),
  heapPerEngine: 0,
  engines: [] as Array<{
    attach: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    loadFile: ReturnType<typeof vi.fn>
    getText: ReturnType<typeof vi.fn>
    heapBytes: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('@services/encodings', () => ({
  readEncoded: mocks.readEncoded,
  setDetected: vi.fn()
}))
vi.mock('@services/lsp', () => ({ lspNotifyFileChanged: vi.fn() }))
vi.mock('@services/notifications', () => ({ notify: mocks.notify }))
vi.mock('@features/editor/engine', () => ({
  createIsolatedEditorEngine: vi.fn(() => {
    const engine = {
      attach: vi.fn(),
      dispose: vi.fn(),
      destroy: vi.fn(),
      loadFile: vi.fn(),
      getText: vi.fn(() => 'x'),
      heapBytes: vi.fn(() => mocks.heapPerEngine)
    }
    mocks.engines.push(engine)
    return engine
  })
}))

import {
  getFileSession,
  applyBackgroundCapNow,
  backgroundModuleCount
} from '@features/editor/fileSession'
import {
  isLowEndMode,
  setLowEndMode,
  subscribeLowEndMode,
  resetLowEndModeForTests
} from '@services/perf'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const host = (): HTMLElement => ({} as HTMLElement)

beforeEach(() => {
  mocks.engines.length = 0
  mocks.notify.mockClear()
  mocks.heapPerEngine = 0
  mocks.readEncoded.mockResolvedValue({ success: true, text: 'x', detected: {} })
  resetLowEndModeForTests()
})

async function openAndHide(path: string): Promise<void> {
  const h = host()
  const session = getFileSession(path)
  session.attach(h)
  await flush()
  await flush()
  session.detach(h)
}

describe('modo PC mala', () => {
  it('store: default off, persiste y emite', () => {
    expect(isLowEndMode()).toBe(false)
    let calls = 0
    const off = subscribeLowEndMode(() => calls++)
    setLowEndMode(true)
    expect(isLowEndMode()).toBe(true)
    expect(calls).toBe(1)
    setLowEndMode(true)
    expect(calls).toBe(1) // sin cambios no emite
    off()
  })

  it('tope background baja a 2 y recorta en caliente', async () => {
    for (let i = 1; i <= 5; i++) {
      await openAndHide(`/low/l${i}.ts`)
    }
    expect(backgroundModuleCount()).toBe(5)
    // Ninguna evicta con tope normal (6).
    expect(mocks.engines.filter((e) => e.destroy.mock.calls.length > 0)).toHaveLength(0)

    setLowEndMode(true)
    applyBackgroundCapNow()
    // 5 → 2: las 3 más viejas destruidas.
    expect(backgroundModuleCount()).toBe(2)
    expect(mocks.engines.filter((e) => e.destroy.mock.calls.length > 0)).toHaveLength(3)
  })

  it('apagar el modo no restaura módulos (requiere re-visita)', async () => {
    await openAndHide(`/low2/a.ts`)
    await openAndHide(`/low2/b.ts`)
    await openAndHide(`/low2/c.ts`)
    setLowEndMode(true)
    applyBackgroundCapNow()
    expect(backgroundModuleCount()).toBe(2)
    setLowEndMode(false)
    applyBackgroundCapNow()
    // Sigue en 2: el modo solo recorta, nunca crea.
    expect(backgroundModuleCount()).toBe(2)
  })
})

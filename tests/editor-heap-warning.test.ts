/**
 * Aviso de heap agregado (Fase 4): al superar ~800 MB sumando heaps WASM
 * reales se notifica UNA vez (latch hasta bajar).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const MB = 1024 * 1024

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

import { getFileSession, destroyFileSession } from '@features/editor/fileSession'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const host = (): HTMLElement => ({} as HTMLElement)

beforeEach(() => {
  mocks.engines.length = 0
  mocks.notify.mockClear()
  mocks.heapPerEngine = 0
  mocks.readEncoded.mockResolvedValue({ success: true, text: 'x', detected: {} })
})

async function openAndHide(path: string): Promise<void> {
  const h = host()
  const session = getFileSession(path)
  session.attach(h)
  await flush()
  await flush()
  session.detach(h)
}

describe('aviso de heap agregado', () => {
  it('avisa una vez al cruzar ~800 MB y no spamea', async () => {
    mocks.heapPerEngine = 200 * MB
    // Tope background = 6 vivos como máximo tras evicción; 5 × 200 = 1000 MB.
    for (let i = 1; i <= 5; i++) {
      await openAndHide(`/heap/h${i}.ts`)
    }
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    expect(mocks.notify.mock.calls[0][0].title).toMatch(/Memoria del editor/)
    // Más archivos: sigue en 1 (latch).
    await openAndHide(`/heap/h6.ts`)
    await openAndHide(`/heap/h7.ts`)
    expect(mocks.notify).toHaveBeenCalledTimes(1)
  })

  it('por debajo del umbral no avisa', async () => {
    mocks.heapPerEngine = 32 * MB
    for (let i = 1; i <= 4; i++) {
      await openAndHide(`/heapok/k${i}.ts`)
    }
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('latch se resetea al liberar', async () => {
    mocks.heapPerEngine = 200 * MB
    for (let i = 1; i <= 5; i++) {
      await openAndHide(`/heapre/r${i}.ts`)
    }
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    // Liberar todo (destroy) y volver a cruzar → avisa de nuevo.
    for (let i = 1; i <= 5; i++) destroyFileSession(`/heapre/r${i}.ts`)
    mocks.heapPerEngine = 0
    await openAndHide(`/heapre/zero.ts`)
    mocks.heapPerEngine = 200 * MB
    for (let i = 1; i <= 5; i++) {
      await openAndHide(`/heapre/s${i}.ts`)
    }
    expect(mocks.notify).toHaveBeenCalledTimes(2)
  })
})

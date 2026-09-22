/**
 * LRU de módulos WASM en background (Fase 1):
 * visitar N archivos no debe retener N heaps. Al superar el tope se evicta
 * la sesión más vieja con snapshot de texto (rehidrata sin disco).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readEncoded: vi.fn(),
  revisionCbs: [] as Array<(revision: number) => void>,
  lastRevision: 0,
  engines: [] as Array<{
    attach: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    loadFile: ReturnType<typeof vi.fn>
    getText: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('@services/encodings', () => ({
  readEncoded: mocks.readEncoded,
  setDetected: vi.fn()
}))
vi.mock('@services/lsp', () => ({ lspNotifyFileChanged: vi.fn() }))
vi.mock('@features/editor/engine', () => ({
  createIsolatedEditorEngine: vi.fn(() => {
    const engine = {
      attach: vi.fn(),
      dispose: vi.fn(),
      destroy: vi.fn(),
      loadFile: vi.fn(),
      getText: vi.fn(() => 'buffer-text'),
      // Dirty: la sesión compara su revisión contra la confirmada. Las
      // revisiones se emiten desde el test con `emitRevision()`.
      getRevision: vi.fn(() => mocks.lastRevision),
      onRevision: vi.fn((cb: (revision: number) => void) => {
        mocks.revisionCbs.push(cb)
        return () => {}
      })
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
  mocks.revisionCbs.length = 0
  mocks.lastRevision = 0
  mocks.readEncoded.mockResolvedValue({ success: true, text: 'disk-content', detected: {} })
})

async function openAndHide(path: string): Promise<void> {
  const h = host()
  const session = getFileSession(path)
  session.attach(h)
  await flush()
  await flush()
  session.detach(h)
}

/** Abre, deja el archivo CON CAMBIOS (dirty) y lo oculta. */
async function openHideAndEdit(path: string): Promise<void> {
  const h = host()
  const session = getFileSession(path)
  session.attach(h)
  await flush()
  await flush()
  const cb = mocks.revisionCbs.at(-1)
  if (cb) {
    // Primera revisión = la carga (clean); la segunda = edición (dirty).
    mocks.lastRevision = 1
    cb(1)
    mocks.lastRevision = 2
    cb(2)
  }
  session.detach(h)
}

describe('LRU de módulos en background', () => {
  it('más allá del tope se evictan las más viejas con snapshot', async () => {
    // Tope = 6: 8 archivos visitados → f1 y f2 evictadas.
    for (let i = 1; i <= 8; i++) {
      await openAndHide(`/lru/f${i}.ts`)
    }
    expect(mocks.engines).toHaveLength(8)
    // Las 2 más viejas destruidas (heap + GL liberados).
    expect(mocks.engines[0].destroy).toHaveBeenCalled()
    expect(mocks.engines[1].destroy).toHaveBeenCalled()
    // Las 6 restantes conservan su módulo.
    for (let i = 2; i < 8; i++) {
      expect(mocks.engines[i].destroy).not.toHaveBeenCalled()
    }
    // Un solo read de disco por archivo.
    expect(mocks.readEncoded).toHaveBeenCalledTimes(8)
  })

  it('reabrir una evictada LIMPIA re-lee de disco (no retiene texto)', async () => {
    for (let i = 1; i <= 8; i++) {
      await openAndHide(`/reh/f${i}.ts`)
    }
    const readsBefore = mocks.readEncoded.mock.calls.length
    const enginesBefore = mocks.engines.length

    // Re-abrir f1 (evictada y limpia): nuevo engine + lectura de disco.
    const h = host()
    getFileSession('/reh/f1.ts').attach(h)
    await flush()
    await flush()

    expect(mocks.engines).toHaveLength(enginesBefore + 1)
    const fresh = mocks.engines[mocks.engines.length - 1]
    expect(fresh.loadFile).toHaveBeenCalledWith('/reh/f1.ts', 'disk-content')
    expect(mocks.readEncoded.mock.calls.length).toBe(readsBefore + 1)
  })

  it('reabrir una evictada CON CAMBIOS rehidrata del snapshot (sin disco)', async () => {
    // h1 con cambios: al evictar NO se puede perder, se guarda el snapshot.
    await openHideAndEdit('/dirty/h1.ts')
    for (let i = 2; i <= 8; i++) {
      await openAndHide(`/dirty/h${i}.ts`)
    }
    const readsBefore = mocks.readEncoded.mock.calls.length

    const h = host()
    getFileSession('/dirty/h1.ts').attach(h)
    await flush()
    await flush()

    const fresh = mocks.engines[mocks.engines.length - 1]
    expect(fresh.loadFile).toHaveBeenCalledWith('/dirty/h1.ts', 'buffer-text')
    expect(mocks.readEncoded.mock.calls.length).toBe(readsBefore)
  })

  it('destroy() saca a la sesión del tracking', async () => {
    for (let i = 1; i <= 7; i++) {
      await openAndHide(`/del/g${i}.ts`)
    }
    // 7 visitados → 1 evicta (g1).
    expect(mocks.engines[0].destroy).toHaveBeenCalled()
    // Destruir g2 (en background) no rompe el invariante en re-attach de otra.
    destroyFileSession('/del/g2.ts')
    const h = host()
    getFileSession('/del/g1.ts').attach(h)
    await flush()
    await flush()
    const fresh = mocks.engines[mocks.engines.length - 1]
    expect(fresh.loadFile).toHaveBeenCalledWith('/del/g1.ts', 'disk-content')
  })
})

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * El manager verifica rutas/hash ANTES de levantar el proceso, así que el
 * mensaje sale un tick después de llamar a `tokenize`: los tests tienen que
 * esperar a que el pedido llegue al proceso antes de contestarlo.
 */
async function untilPosted(count = 1): Promise<void> {
  for (let i = 0; i < 100 && worker.posted.length < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(worker.posted).toHaveLength(count)
}
import type { DynamicTokenizeRequest } from '../src/shared/extensions'

/**
 * El manager es lo que separa "cargar un wasm de terceros" de "colgar la
 * ventana": acá se prueban el timeout, la caída del proceso y las
 * verificaciones previas (jail de rutas + sha256). Los procesos son FALSOS —
 * lo que se prueba es la política, no tree-sitter.
 */
const root = mkdtempSync(join(tmpdir(), 'scrakk-treesitter-'))

vi.mock('electron', () => ({
  app: {
    getPath: (): string => join(root, 'userData')
  },
  utilityProcess: {
    fork: () => {
      throw new Error('los tests inyectan su propio spawner')
    }
  }
}))

const { TreeSitterManager } = await import('../src/main/extensions/treeSitter/manager')

/** Proceso falso: guarda lo que le mandan y deja responder/colgarse a mano. */
class FakeWorker {
  posted: Array<{ id: number; type: string; payload: DynamicTokenizeRequest }> = []
  killed = 0
  private messageListener: ((message: unknown) => void) | null = null
  private exitListener: ((code: number) => void) | null = null

  postMessage(message: unknown): void {
    this.posted.push(message as { id: number; type: string; payload: DynamicTokenizeRequest })
  }

  on(event: 'message' | 'exit', listener: (payload: never) => void): void {
    if (event === 'message') this.messageListener = listener as (message: unknown) => void
    else this.exitListener = listener as (code: number) => void
  }

  kill(): void {
    this.killed++
  }

  /** Contesta el último pedido con un resultado mínimo. */
  respond(result: Record<string, unknown> = {}): void {
    const last = this.posted[this.posted.length - 1]
    this.messageListener?.({
      id: last.id,
      ok: true,
      result: { ok: true, scopeSets: [], tokens: [], applied: [], failed: [], ...result }
    })
  }

  crash(code = 1): void {
    this.exitListener?.(code)
  }
}

function request(overrides: Partial<DynamicTokenizeRequest> = {}): DynamicTokenizeRequest {
  return {
    languageId: 'demo',
    parserPath: join(root, 'userData', 'extensions', 'demo', 'grammars', 'demo.wasm'),
    queries: [{ file: join(root, 'userData', 'extensions', 'demo', 'queries', 'highlights.scm'), category: 'highlights' }],
    text: 'hola',
    ...overrides
  }
}

let worker: FakeWorker

beforeAll(() => {
  const dir = join(root, 'userData', 'extensions', 'demo')
  mkdirSync(join(dir, 'grammars'), { recursive: true })
  mkdirSync(join(dir, 'queries'), { recursive: true })
  writeFileSync(join(dir, 'grammars', 'demo.wasm'), 'wasm-falso')
  writeFileSync(join(dir, 'queries', 'highlights.scm'), '(identifier) @variable')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function manager(idleShutdownMs = 10_000): InstanceType<typeof TreeSitterManager> {
  worker = new FakeWorker()
  return new TreeSitterManager({
    spawn: () => worker,
    requestTimeoutMs: 50,
    idleShutdownMs
  })
}

describe('manager de tree-sitter dinámico', () => {
  it('levanta el proceso en el primer pedido y rutea la respuesta por id', async () => {
    const mgr = manager()
    expect(mgr.isRunning()).toBe(false)

    const pending = mgr.tokenize(request())
    // El proceso se levanta la primera vez que hace falta, no al arrancar la app.
    await untilPosted()
    expect(mgr.isRunning()).toBe(true)
    expect(worker.posted[0].payload.languageId).toBe('demo')

    worker.respond({ applied: ['highlights.scm'] })
    const result = await pending
    expect(result.ok).toBe(true)
    expect(result.applied).toEqual(['highlights.scm'])
  })

  it('rechaza el pedido si el sha256 declarado no coincide (no ejecuta el wasm)', async () => {
    const mgr = manager()
    await expect(mgr.tokenize(request({ sha256: 'deadbeef' }))).rejects.toThrow(/sha256/)
    // Ni siquiera se levantó el worker: la verificación va antes.
    expect(mgr.isRunning()).toBe(false)
    expect(worker.posted).toHaveLength(0)
  })

  it('acepta el parser cuando el sha256 coincide', async () => {
    const digest = createHash('sha256')
      .update('wasm-falso')
      .digest('hex')
    const mgr = manager()
    const pending = mgr.tokenize(request({ sha256: digest }))
    await untilPosted()
    worker.respond()
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  it('rechaza rutas fuera del directorio de extensiones', async () => {
    const mgr = manager()
    await expect(
      mgr.tokenize(request({ parserPath: join(root, 'afuera.wasm') }))
    ).rejects.toThrow(/fuera del directorio de extensiones/)
    expect(mgr.isRunning()).toBe(false)
  })

  it('un pedido sin respuesta mata el proceso en vez de colgarse', async () => {
    const mgr = manager()
    const pending = mgr.tokenize(request())
    await untilPosted()
    // Sin respuesta: el wasm colgado no se recupera, se mata el proceso.
    await expect(pending).rejects.toThrow(/sin respuesta/)
    expect(worker.killed).toBe(1)
    expect(mgr.isRunning()).toBe(false)
  })

  it('si el proceso se cae, rechaza TODO lo pendiente (no espera el timeout)', async () => {
    const mgr = manager()
    const first = mgr.tokenize(request())
    const second = mgr.tokenize(request())
    await untilPosted(2)
    worker.crash(7)
    await expect(first).rejects.toThrow(/terminó \(código 7\)/)
    await expect(second).rejects.toThrow(/terminó \(código 7\)/)
    expect(mgr.isRunning()).toBe(false)
  })

  it('apaga el worker cuando nadie lo usa', async () => {
    const mgr = manager(15)
    const pending = mgr.tokenize(request())
    await untilPosted()
    worker.respond()
    await pending
    expect(mgr.isRunning()).toBe(true)
    // Se apaga solo: la mayoría de las sesiones no abre un lenguaje dinámico
    // y no tiene por qué cargar con un proceso vivo por el resto del día.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(mgr.isRunning()).toBe(false)
    expect(worker.killed).toBe(1)
  })
})

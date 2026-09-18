/**
 * Pull de diagnósticos (`textDocument/diagnostic`, LSP 3.17).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE CAMINO
 *
 * Los servers de CSS/HTML/JSON **no** validan cuando tipeás: su camino de push
 * usa un debounce FIJO de 500 ms (`validationDelayMs`) que se reinicia con cada
 * cambio, así que el subrayado aparecía ~650 ms después de la última tecla (y
 * cualquier edición dentro de esa ventana CANCELABA la validación pendiente:
 * el error que acababas de escribir no se marcaba nunca).
 *
 * Si el cliente anuncia `textDocument.diagnostic`, esos servers registran pull:
 * `validate(document)` corre SIN espera y el cliente decide cuándo preguntar.
 * Estos tests fijan ese contrato contra un server mock real:
 *
 *   1. la capability se anuncia (es lo que hace cambiar de camino al server),
 *   2. con pull los diagnósticos llegan SIN push (el mock no publica),
 *   3. el pull se agrupa: no hay un request por tecla,
 *   4. si el server anuncia pull y contesta MethodNotFound, el cliente VUELVE
 *      al push (válvula de escape: sin eso el archivo quedaría sin nada),
 *   5. `workspace/diagnostic/refresh` hace re-consultar (único aviso que queda
 *      cuando ya no hay push),
 *   6. cerrar el documento limpia sus problemas (con pull nadie manda el `[]`).
 */

import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { LspClient } from '../../src/main/lsp/client'
import type { DiagnosticsChangedPayload } from '@shared/lsp'
import { makeTempDir, cleanupDir, waitFor } from '../helpers/lsp-test-utils'

const MOCK_SERVER = path.resolve(__dirname, '../helpers/mock-lsp-server.mjs')

interface MockState {
  pullCount: number
  pulledUris: (string | null)[]
  clientCapabilities: {
    textDocument?: { diagnostic?: unknown; publishDiagnostics?: unknown }
  } | null
  changeCount: number
  openCount: number
}

function makeClient(
  name: string,
  projectDir: string,
  received: DiagnosticsChangedPayload[]
): LspClient {
  return new LspClient(
    name,
    1,
    { command: process.execPath, args: [MOCK_SERVER, name], extensions: { '.mockts': 'mocklang' } },
    projectDir,
    {
      onDiagnostics: (payload) => received.push(payload),
      onState: () => {},
      onProcessExit: () => {}
    }
  )
}

/** Server mock en modo pull (anuncia `diagnosticProvider` y no publica). */
async function withPullServer(
  name: string,
  env: Record<string, string>,
  body: (context: {
    client: LspClient
    file: string
    received: DiagnosticsChangedPayload[]
    state: () => Promise<MockState>
  }) => Promise<void>
): Promise<void> {
  const projectDir = await makeTempDir(`lsp-${name}-`)
  const received: DiagnosticsChangedPayload[] = []
  const keys = Object.keys(env)
  try {
    for (const key of keys) process.env[key] = env[key]
    const client = makeClient(name, projectDir, received)
    await client.start()
    const file = path.join(projectDir, 'style.mockts')
    await body({
      client,
      file,
      received,
      state: () => client.request<MockState>('mock/state', {}, 5000)
    })
    await client.shutdown()
  } finally {
    for (const key of keys) delete process.env[key]
    await cleanupDir(projectDir)
  }
}

describe('LspClient: pull de diagnósticos', () => {
  it('anuncia textDocument.diagnostic en initialize', async () => {
    await withPullServer('pullcap', { MOCK_PULL: '1' }, async ({ file, state }) => {
      const info = await state()
      expect(info.clientCapabilities?.textDocument?.diagnostic).toBeTruthy()
      // El push se sigue declarando: los servers sin pull lo necesitan.
      expect(info.clientCapabilities?.textDocument?.publishDiagnostics).toBeTruthy()
      expect(file).toContain('style.mockts')
    })
  }, 20_000)

  it('con pull, los diagnósticos llegan SIN que el server los publique', async () => {
    await withPullServer('pullok', { MOCK_PULL: '1' }, async ({ client, file, received, state }) => {
      await client.notifyFileChange(file, 'body { color: ; }\n', 'mocklang')

      const payload = await waitFor(() => received.find((entry) => entry.diagnostics.length > 0))
      expect(payload.diagnostics[0]?.message).toContain('pullok')

      const info = await state()
      expect(info.pullCount).toBeGreaterThanOrEqual(1)
      expect(String(info.pulledUris.at(-1))).toContain('style.mockts')
    })
  }, 20_000)

  it('el pull se AGRUPA: N cambios seguidos no son N requests', async () => {
    await withPullServer('pullcoalesce', { MOCK_PULL: '1' }, async ({ client, file, state }) => {
      // Ráfaga: como tipear (el renderer ya coalesce a 40 ms, esto es peor caso).
      for (let index = 1; index <= 8; index += 1) {
        await client.notifyFileChange(file, `body { color: red; }\n/* ${index} */\n`, 'mocklang')
      }
      // Leading edge + a lo sumo un par de agrupados; en ningún caso 9.
      const info = await state()
      expect(info.pullCount).toBeGreaterThanOrEqual(1)
      expect(info.pullCount).toBeLessThanOrEqual(3)
      // Los 8 cambios llegaron (el primero es el didOpen del archivo).
      expect(info.openCount + info.changeCount).toBeGreaterThanOrEqual(8)
    })
  }, 20_000)

  it('MethodNotFound → apaga el pull y vuelve al push', async () => {
    await withPullServer(
      'pullfail',
      { MOCK_PULL_FAIL: '1' },
      async ({ client, file, received, state }) => {
        await client.notifyFileChange(file, 'body { color: ; }\n', 'mocklang')
        // El mock sigue publicando por push en este modo: los diagnósticos
        // tienen que llegar igual (si no, el archivo se queda sin nada).
        const payload = await waitFor(() => received.find((entry) => entry.diagnostics.length > 0))
        expect(payload.diagnostics[0]?.message).toContain('pullfail')

        await waitFor(() => (received.length >= 2 ? true : undefined))
        const info = await state()
        // Un único intento de pull: después el cliente se queda con el push.
        expect(info.pullCount).toBe(1)
        expect(info.openCount).toBe(1)
      }
    )
  }, 20_000)

  it('workspace/diagnostic/refresh hace re-consultar', async () => {
    await withPullServer(
      'pullrefresh',
      { MOCK_PULL: '1', MOCK_PULL_REFRESH: '1' },
      async ({ client, file, state }) => {
        await client.notifyFileChange(file, 'body { color: red; }\n', 'mocklang')
        // El mock manda el refresh tras el primer pull: el cliente tiene que
        // volver a pedir (con pull, ese request es el único aviso que queda).
        const after = await waitForCount(state, 2)
        expect(after.pullCount).toBeGreaterThanOrEqual(2)
      }
    )
  }, 20_000)

  it('cerrar el documento limpia sus problemas (pull no manda el [])', async () => {
    await withPullServer('pullclose', { MOCK_PULL: '1' }, async ({ client, file, received }) => {
      await client.notifyFileChange(file, 'body { color: ; }\n', 'mocklang')
      await waitFor(() => received.find((entry) => entry.diagnostics.length > 0))

      await client.notifyFileClosed(file)
      const cleared = await waitFor(() =>
        received.find((entry) => entry.path === file && entry.diagnostics.length === 0)
      )
      expect(cleared.diagnostics).toHaveLength(0)
    })
  }, 20_000)
})

/** Poll del estado del mock hasta que `pullCount` llegue a `minimum`. */
async function waitForCount(
  state: () => Promise<MockState>,
  minimum: number
): Promise<MockState> {
  const deadline = Date.now() + 8000
  let last = await state()
  while (Date.now() < deadline) {
    if (last.pullCount >= minimum) return last
    await new Promise((resolve) => setTimeout(resolve, 50))
    last = await state()
  }
  return last
}

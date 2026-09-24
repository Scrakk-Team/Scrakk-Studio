// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe temporal: activa una extensión REAL (Cline) en la app compilada.
 *
 * Lanza el binario de `out/` con un perfil aparte (`release/_probe-cline`) y
 * habla por CDP: primero `ensure` (que arranca el Extension Host y corre
 * `activate`) y después `resolveView`. Mientras tanto captura:
 *  - stdout/stderr del proceso main (que reenvía el del host),
 *  - la consola del renderer.
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Id de la PRIMERA vista declarada por la extensión (fuente: su manifest SEF). */
function readFirstViewId(manifestPath) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return manifest?.contributes?.views?.[0]?.id ?? 'claude-dev.SidebarProvider'
  } catch {
    return 'claude-dev.SidebarProvider'
  }
}

const PROFILE = 'release/_probe-cline'
const EXT_DIR = join(PROFILE, 'extensions')
const REAL_EXT = join(process.env.HOME ?? '', '.config/scrakk-studio/extensions')
const WORKSPACE = process.cwd()
const PORT = 9333
const EXT_ID = 'vscode-saoudrizwan.claude-dev'

// ── Perfil limpio con la extensión ya "instalada" ─────────────────────────
rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(EXT_DIR, { recursive: true })
const source = join(REAL_EXT, EXT_ID)
if (!existsSync(source)) {
  console.error(`no está instalada la extensión: ${source}`)
  process.exit(1)
}
console.log('copiando la extensión (21 MB de bundle)...')
cpSync(source, join(EXT_DIR, EXT_ID), { recursive: true })
writeFileSync(join(PROFILE, 'probe.json'), JSON.stringify({ startedAt: new Date().toISOString() }))

const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
if (!existsSync(electron)) {
  console.error('no encontré el binario de electron')
  process.exit(1)
}

const child = spawn(
  electron,
  ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'],
  {
    env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':99', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  }
)

const mainLog = []
const record = (prefix, chunk) => {
  const text = chunk.toString()
  mainLog.push(`${prefix} ${text}`)
  process.stdout.write(`${prefix} ${text}`)
}
child.stdout.on('data', (chunk) => record('[main]', chunk))
child.stderr.on('data', (chunk) => record('[err ]', chunk))

// ── CDP ───────────────────────────────────────────────────────────────────
async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const list = await res.json()
  return list.find((t) => t.type === 'page' && t.url.includes('index.html')) ?? list[0]
}

const pending = new Map()
let messageId = 0
/**
 * Contexto de ejecución del MUNDO PRINCIPAL del renderer.
 *
 * Con `contextIsolation: true` hay dos mundos y `Runtime.evaluate` sin
 * `contextId` puede caer en el del preload, donde `window.api` NO existe (eso
 * pasó: el probe reportaba `undefined` en llamadas que sí funcionaban porque
 * las hacía la propia app). El mundo principal es el que tiene `isDefault`.
 */
let mainContextId = null

/** Manda un comando y resuelve con el mensaje COMPLETO (para ver errores). */
function send(ws, method, params) {
  const id = ++messageId
  return new Promise((resolve) => {
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

/** `Runtime.evaluate` con awaitPromise; devuelve el valor o un error legible. */
async function evaluate(ws, expression, { awaitPromise = true } = {}) {
  const message = await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    ...(mainContextId === null ? {} : { contextId: mainContextId }),
    timeout: 300_000
  })
  if (!message) return { ok: false, error: 'sin respuesta de CDP' }
  if (message.error) return { ok: false, error: JSON.stringify(message.error) }
  const remote = message.result
  if (!remote) {
    return { ok: false, error: `respuesta sin result: ${JSON.stringify(message)}` }
  }
  if (remote.exceptionDetails) {
    return {
      ok: false,
      error: remote.exceptionDetails.exception?.description ?? remote.exceptionDetails.text
    }
  }
  // `message` YA es el `result` del frame, así que el valor está en `.value`
  // (descender otra vez devolvía siempre `undefined`).
  if (remote.type === 'undefined') return { ok: true, value: undefined }
  return { ok: true, value: remote.value }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  let ws
  for (let i = 0; i < 40; i++) {
    await wait(1500)
    try {
      const page = await target()
      if (!page?.webSocketDebuggerUrl) continue
      // WebSocket global de Node (sin dependencias).
      ws = new WebSocket(page.webSocketDebuggerUrl)
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true })
        ws.addEventListener('error', reject, { once: true })
      })
      break
    } catch {
      // todavía arrancando
    }
  }
  if (!ws) throw new Error('no pude conectarme por CDP')

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      if (process.env.PROBE_DEBUG === '1') console.log('<<<', JSON.stringify(msg).slice(0, 300))
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
      return
    }
    if (msg.method === 'Runtime.executionContextCreated') {
      const context = msg.params?.context
      if (context?.auxData?.isDefault === true) mainContextId = context.id
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
      console.log(`[renderer:${msg.params.type}] ${text}`)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
    }
  })
  // `Runtime.enable` va por `send()`: con el id fijo 1 chocaba con la PRIMERA
  // llamada real (`id` también 1) y esa respuesta vacía se tomaba como el
  // resultado de `evaluate` (todo salía "undefined").
  void send(ws, 'Runtime.enable', {})

  // La app y el puente tienen que estar listos.
  for (let i = 0; i < 40; i++) {
    const ready = await evaluate(
      ws,
      `document.readyState === 'complete' && !!window.api?.extensions?.host`,
      { awaitPromise: false }
    )
    if (ready.value === true) break
    await wait(1000)
  }
  const bridge = await evaluate(ws, `!!window.api?.extensions?.host`, { awaitPromise: false })
  console.log(
    '\n=== puente del Extension Host:',
    bridge.ok ? bridge.value : `ERROR ${bridge.error}`
  )
  // Si el api no está, no tiene sentido seguir: se avisa con el motivo real.
  const diag = await evaluate(
    ws,
    `JSON.stringify({ api: typeof window.api, keys: Object.keys(window.api ?? {}), ready: document.readyState, body: (document.body?.innerText ?? '').slice(0, 300) })`,
    { awaitPromise: false }
  )
  console.log('=== diagnóstico del renderer:', diag.ok ? diag.value : `ERROR ${diag.error}`)

  console.log('=== ensure (arranca el host y corre activate; puede tardar MINUTOS) ===')
  const ensured = await evaluate(
    ws,
    `window.api.extensions.host.ensure({ id: ${JSON.stringify(EXT_ID)}, workspaceRoots: [${JSON.stringify(WORKSPACE)}], mode: 'strict' })`
  )
  console.log('ensure →', ensured.ok ? JSON.stringify(ensured.value) : `ERROR ${ensured.error}`)

  // El id de la vista sale del manifest (no se adivina): un cambio de
  // mayúsculas en el id hacía fallar el probe contra una extensión sana.
  const viewId = readFirstViewId(join(EXT_DIR, EXT_ID, 'manifest.json'))
  console.log('vista declarada por la extensión:', viewId)

  // La extensión puede registrar su provider DESPUÉS de que `activate`
  // resuelve (init async): se reintenta y se reporta cuánto tardó.
  let resolved = null
  for (let attempt = 1; attempt <= 8; attempt++) {
    resolved = await evaluate(
      ws,
      `window.api.extensions.host.resolveView({ id: ${JSON.stringify(EXT_ID)}, viewId: ${JSON.stringify(viewId)}, title: 'Cline' })`
    )
    if (resolved.ok && resolved.value?.success) break
    console.log(`resolveView intento ${attempt} →`, JSON.stringify(resolved.value ?? resolved.error))
    await wait(4000)
  }
  console.log('resolveView →', resolved.ok ? JSON.stringify(resolved.value) : `ERROR ${resolved.error}`)

  // Un comando LOCAL que la extensión registró al activar: verifica que la UI
  // pueda correrlo por el puente (el camino que usa el botón de un panel).
  const commands = await evaluate(
    ws,
    `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(EXT_ID)}, command: 'cline.plusButtonClicked', args: [] })`
  )
  console.log(
    'executeCommand(cline.plusButtonClicked) →',
    commands.ok ? JSON.stringify(commands.value) : `ERROR ${commands.error}`
  )

  // Un rato largo a propósito: el latido de `activate` sale cada 15 s, así que
  // 2 minutos alcanzan para ver si terminó, sigue, o quedó esperando algo.
  await wait(60_000)
  console.log('\n=== FIN DEL PROBE ===')
}

main()
  .catch((error) => {
    console.error('probe falló:', error)
  })
  .finally(async () => {
    try {
      child.kill('SIGKILL')
    } catch {
      // ya estaba muerto
    }
    await wait(500)
    console.log('\n=== log del main (últimas 120 líneas) ===')
    console.log(mainLog.join('').split('\n').slice(-120).join('\n'))
  })

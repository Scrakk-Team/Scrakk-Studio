// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe: ¿qué bloquea el hilo principal en el arranque (y por lo tanto retrasa
 * el primer click a un panel)?
 *
 * Instala antes de que corra la app:
 *   - PerformanceObserver de `longtask` (trabajo > 50 ms de una sola vez),
 *   - un hook de console.* que anota cada log con su timestamp.
 *
 * Con las dos listas juntas se ve QUÉ paso del arranque se come el hilo:
 * si el bloqueo cae justo después del log de Innerta, no es la precarga de
 * paneles; si cae después de un import de panel, sí.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-boot-blocking'
const PORT = 9416

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })

const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
const child = spawn(
  electron,
  ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'],
  {
    env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':99' },
    stdio: ['ignore', 'pipe', 'pipe']
  }
)
child.stderr.on('data', (chunk) => process.stdout.write(`[err ] ${chunk}`))
process.on('exit', () => {
  try {
    child.kill('SIGKILL')
  } catch {
    // ya murió
  }
})

async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const list = await res.json()
  return list.find((t) => t.type === 'page' && t.url.includes('index.html')) ?? list[0]
}

const pending = new Map()
let messageId = 0
let mainContextId = null

function send(ws, method, params) {
  const id = ++messageId
  return new Promise((resolve) => {
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(ws, expression) {
  const message = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    ...(mainContextId === null ? {} : { contextId: mainContextId }),
    timeout: 300_000
  })
  if (!message) return { ok: false, error: 'sin respuesta' }
  if (message.exceptionDetails) {
    return {
      ok: false,
      error: message.exceptionDetails.exception?.description ?? message.exceptionDetails.text
    }
  }
  return { ok: true, value: message.result?.value }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const INSTRUMENT = `(() => {
  window.__boot = { t0: performance.now(), long: [], logs: [] }
  const stamp = () => Math.round(performance.now() - window.__boot.t0)
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__boot.long.push({
          at: Math.round(entry.startTime - window.__boot.t0),
          ms: Math.round(entry.duration),
          attribution: (entry.attribution ?? []).map((a) => a.name || a.containerType).join(',')
        })
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch (error) {
    window.__boot.longError = String(error)
  }
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level]
    console[level] = (...args) => {
      const text = args
        .map((arg) => (typeof arg === 'string' ? arg : (arg?.message ?? String(arg))))
        .join(' ')
        .slice(0, 160)
      window.__boot.logs.push({ at: stamp(), level, text })
      return original.apply(console, args)
    }
  }
  return true
})()`

async function main() {
  let ws
  for (let i = 0; i < 40; i++) {
    await wait(1500)
    try {
      const page = await target()
      if (!page?.webSocketDebuggerUrl) continue
      ws = new WebSocket(page.webSocketDebuggerUrl)
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true })
        ws.addEventListener('error', reject, { once: true })
      })
      break
    } catch {
      // todavía no levantó
    }
  }
  if (!ws) throw new Error('sin CDP')

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
      return
    }
    if (msg.method === 'Runtime.executionContextCreated') {
      const context = msg.params?.context
      if (context?.auxData?.isDefault === true) mainContextId = context.id
      return
    }
    if (msg.method === 'Runtime.executionContextDestroyed') {
      if (msg.params?.executionContextId === mainContextId) mainContextId = null
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})

  await wait(2500)
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       return true
     })()`
  )
  await send(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })
  await evaluate(ws, `window.location.reload()`)
  mainContextId = null
  await wait(9000)

  const boot = JSON.parse((await evaluate(ws, 'JSON.stringify(window.__boot)')).value ?? 'null')
  if (!boot) {
    console.log('[probe] sin datos')
    child.kill('SIGKILL')
    return
  }

  // Línea de tiempo mezclada: logs 🤍 y bloqueos 🟥, para ver QUÉ paso se come
  // el hilo (un log justo antes del bloqueo es el sospechoso).
  const events = [
    ...boot.logs.map((log) => ({ ...log, kind: 'log' })),
    ...boot.long.map((task) => ({ ...task, kind: 'long' }))
  ].sort((a, b) => a.at - b.at)

  console.log('\n=== línea de tiempo del arranque (t en ms) ===')
  for (const event of events) {
    if (event.kind === 'long') {
      console.log(`  t=${String(event.at).padStart(6)}  🟥 BLOQUEO ${String(event.ms).padStart(5)} ms  ${event.attribution}`)
    } else {
      console.log(`  t=${String(event.at).padStart(6)}  🤍 ${event.level.padEnd(5)} ${event.text}`)
    }
  }

  const total = boot.long.reduce((sum, task) => sum + task.ms, 0)
  console.log(`\n  ${boot.long.length} bloqueos · ${total} ms de hilo principal`)
  const worst = boot.long.slice().sort((a, b) => b.ms - a.ms)[0]
  if (worst) console.log(`  el peor: ${worst.ms} ms en t=${worst.at}`)

  child.kill('SIGKILL')
}

main().catch((error) => {
  console.error(`[probe] ${error.message}`)
  try {
    child.kill('SIGKILL')
  } catch {
    // ya murió
  }
  process.exit(1)
})

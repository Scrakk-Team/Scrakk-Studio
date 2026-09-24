// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe: latencia REAL de abrir un panel (click → panel pintado).
 *
 * El síntoma reportado: "a veces se queda en Cargando panel… y no carga hasta
 * que cambio de panel y vuelvo". Para medirlo hay dos relojes:
 *
 *  - FRÍO: se recarga la ventana y se clickea el panel apenas existen los
 *    botones. Es el caso en que el módulo todavía no está cargado (no dio
 *    tiempo al preload) y por eso aparece el "Cargando panel…".
 *  - CALIENTE: con el preload ya hecho, se mide click → el header del slot
 *    cambia de título (o sea: el panel NUEVO ya se montó).
 *
 * Además se registra cuánto tiempo estuvo visible el texto "Cargando panel…"
 * (si aparece) y todo lo que bloquea el hilo principal mientras tanto
 * (long tasks), que es la sospecha: la carga de un panel compite con el
 * trabajo de montaje de OTROS paneles que el preload dispara en idle.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-panel-ready'
const PORT = 9413

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

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

const LABELS = {
  explorer: 'Explorador',
  search: 'Búsqueda',
  browser: 'Browser',
  debug: 'Debug',
  git: 'Git',
  notes: 'Notas',
  chat: 'Chat',
  social: 'Social'
}

const clickJs = (id) =>
  `(() => {
     const el = document.querySelector('[data-button-id=' + JSON.stringify(${JSON.stringify(id)}) + ']')
     if (!el) return false
     el.click()
     return true
   })()`

/** ¿Existe ya un header de panel con este título? */
const hasHeader = (label) =>
  `[...document.querySelectorAll('header span')].some((s) => (s.textContent ?? '').trim() === ${JSON.stringify(label)})`

const LOADING_NOW = `(() => {
  const nodes = [...document.querySelectorAll('*')].filter(
    (el) => el.children.length === 0 && (el.textContent ?? '').trim() === 'Cargando panel…'
  )
  return nodes.filter((el) => el.getBoundingClientRect().height > 0).length
})()`

/**
 * Mide click → header visible, con polling de 20 ms.
 * Devuelve { ms, loaderMs } donde loaderMs es cuánto estuvo el loader visible.
 */
async function timeOpen(ws, id, budgetMs = 12_000) {
  const label = LABELS[id]
  const alreadyThere = (await evaluate(ws, hasHeader(label))).value
  const started = Date.now()
  const clicked = (await evaluate(ws, clickJs(id))).value
  if (!clicked) return { ms: 'sin botón', loaderMs: 0 }
  let loaderMs = 0
  let loaderSince = null
  let ready = alreadyThere ? 0 : null
  while (Date.now() - started < budgetMs) {
    const loading = (await evaluate(ws, LOADING_NOW)).value
    if (loading > 0 && loaderSince === null) loaderSince = Date.now()
    if (loading === 0 && loaderSince !== null) {
      loaderMs += Date.now() - loaderSince
      loaderSince = null
    }
    if (ready === null && (await evaluate(ws, hasHeader(label))).value) {
      ready = Date.now() - started
      break
    }
    await wait(20)
  }
  if (loaderSince !== null) loaderMs += Date.now() - loaderSince
  return { ms: ready ?? 'COLGADO', loaderMs, alreadyThere }
}

/** Long tasks (trabajo que bloquea el hilo principal) desde `__t0`. */
const WATCH_LONG_TASKS = `(() => {
  window.__long = []
  window.__t0 = performance.now()
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__long.push({
          at: Math.round(entry.startTime - window.__t0),
          ms: Math.round(entry.duration),
          name: entry.name === 'self' ? 'self' : entry.name
        })
      }
    }).observe({ entryTypes: ['longtask'] })
    return true
  } catch (error) {
    return String(error)
  }
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

  await wait(2500)
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       return true
     })()`
  )

  // ── 1. FRÍO: recargar y clickear apenas existan los botones ──────────────
  console.log('\n=== 1. FRÍO (recarga + click inmediato, sin preload) ===')
  await evaluate(ws, `window.location.reload()`)
  mainContextId = null
  const coldTargets = ['explorer', 'search', 'browser', 'debug', 'git', 'notes', 'social', 'chat']
  // Espera mínima a que haya botones (la app arranca): sondea barato.
  for (let i = 0; i < 600; i++) {
    const ok = (await evaluate(ws, `document.querySelectorAll('[data-button-id]').length > 0`)).value
    if (ok) break
    await wait(50)
  }
  await evaluate(ws, WATCH_LONG_TASKS)
  const coldResults = []
  for (const id of coldTargets) {
    const result = await timeOpen(ws, id)
    coldResults.push({ id, ...result })
    console.log(
      `  ${id.padEnd(9)} click → header: ${String(result.ms).padStart(7)} ms   ` +
        `loader visible: ${String(result.loaderMs).padStart(5)} ms   (ya estaba: ${result.alreadyThere})`
    )
    await wait(250)
  }

  const longTasks = JSON.parse((await evaluate(ws, 'JSON.stringify(window.__long)')).value ?? '[]')
  console.log('\n=== long tasks (>50 ms de hilo principal bloqueado) ===')
  for (const task of longTasks.slice(0, 25)) console.log(`  t=${String(task.at).padStart(6)} ms  ${String(task.ms).padStart(5)} ms`)
  const total = longTasks.reduce((sum, task) => sum + task.ms, 0)
  console.log(`  ${longTasks.length} long tasks · ${total} ms bloqueados en total`)

  // ── 2. CALIENTE: barrido con preload hecho ───────────────────────────────
  console.log('\n=== 2. CALIENTE (barrido, todo ya precalentado) ===')
  const warm = ['git', 'notes', 'chat', 'social', 'search', 'debug', 'browser', 'explorer']
  const warmResults = []
  for (let round = 1; round <= 2; round++) {
    for (const id of warm) {
      const result = await timeOpen(ws, id, 6000)
      warmResults.push({ id, ...result })
      process.stdout.write(`  r${round} ${id.padEnd(9)} ${String(result.ms).padStart(6)} ms`)
      if (result.loaderMs > 0) process.stdout.write(` (loader ${result.loaderMs} ms)`)
      process.stdout.write('\n')
      await wait(150)
    }
  }

  // ── Veredicto: el bug era el header que no cambiaba (parecía que el panel
  // no había cargado) y el loader pegado. Acá no hay margen de interpretación.
  console.log('\n=== veredicto ===')
  const all = [...coldResults, ...warmResults]
  const stuck = all.filter((r) => typeof r.ms !== 'number').map((r) => r.id)
  check(
    'ningún panel quedó sin cambiar (título del header)',
    stuck.length === 0,
    stuck.join(', ') || `los ${all.length} cambian`
  )
  const slowest = Math.max(...all.filter((r) => typeof r.ms === 'number').map((r) => r.ms))
  check('el panel más lento cambió en menos de 400 ms', slowest < 400, `${slowest} ms`)
  const loaderSeen = Math.max(...all.map((r) => r.loaderMs))
  check('ningún panel quedó con el loader visible más de 1,5 s', loaderSeen < 1500, `${loaderSeen} ms`)

  child.kill('SIGKILL')
  console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
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

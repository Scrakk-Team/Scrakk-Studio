/**
 * Probe: latencia real de apertura de paneles + ¿aparece "Cargando panel…"?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ MIDE
 *
 * El bug era: el panel se quedaba en "Cargando panel…" hasta cambiar de tab y
 * volver (React.lazy + Suspense no reintentaba). El arreglo usa import
 * dinámico + cache, y además los módulos se PRECALIENTAN (idle del arranque +
 * hover del botón de la barra).
 *
 * Para cada panel de la activity bar este probe hace click y sondea cada 40ms:
 *
 *   - cuánto tarda en aparecer su título en el header (cambio de panel),
 *   - si el texto "Cargando panel…" llegó a verse,
 *   - cuántos ms hasta que el panel quedó montado (sin fallback),
 *   - qué chunks pidió por red el click (un panel precalentado: ninguno).
 *
 * Caso COLD: el primer click se hace apenas arranca la app, antes de que corra
 * el preload por idle; ahí sí hay descarga, y lo que importa es que termine —
 * nunca que quede colgado.
 *
 * Uso:  node tools/_probe-panel-loading.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-panel-loading'
const PORT = 9401

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })

const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
const child = spawn(
  electron,
  ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'],
  {
    env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':99', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  }
)
child.stdout.on('data', (chunk) => process.stdout.write(`[main] ${chunk}`))
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
    ...(mainContextId === null ? {} : { contextId: mainContextId }),
    timeout: 300_000
  })
  if (!message) return { ok: false, error: 'sin respuesta de CDP' }
  if (message.error) return { ok: false, error: JSON.stringify(message.error) }
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
  console.log(`${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

/** Títulos en los headers + si hay algún nodo de "Cargando panel…". */
const SNAPSHOT = `(() => {
  const titles = [...document.querySelectorAll('header span')].map((el) => (el.textContent ?? '').trim())
  const loading = [...document.querySelectorAll('div,p')].some(
    (el) => el.children.length === 0 && (el.textContent ?? '').trim() === 'Cargando panel…'
  )
  return { titles, loading }
})()`

/** Paneles de la activity bar: id del botón → título esperado del header. */
const TARGETS = [
  { button: 'search', title: 'Búsqueda' },
  { button: 'git', title: 'Git' },
  { button: 'notes', title: 'Notas' },
  { button: 'chat', title: 'Chat' },
  { button: 'social', title: 'Social' },
  { button: 'browser', title: 'Browser' },
  { button: 'debug', title: 'Debug' }
]

/**
 * Click + sondeo: devuelve la latencia hasta que el panel está montado
 * (título en el header y sin fallback) y si el fallback llegó a verse.
 */
async function openAndMeasure(ws, { button, title }, budgetMs = 4000) {
  // El botón de la barra es un TOGGLE: si el panel ya está abierto, el click
  // lo cierra (y no habría nada que medir). Se asegura cerrado primero.
  const before = (await evaluate(ws, SNAPSHOT)).value
  if (before.titles.includes(title)) {
    await evaluate(ws, `document.querySelector('[data-button-id=${JSON.stringify(button)}]')?.click()`)
    await wait(900)
  }
  const beforeChunks = chunks.length
  await evaluate(ws, `document.querySelector('[data-button-id=${JSON.stringify(button)}]')?.click()`)
  const start = Date.now()
  let fallbackSeen = false
  let shownAt = null
  let mountedAt = null
  while (Date.now() - start < budgetMs) {
    const snap = (await evaluate(ws, SNAPSHOT)).value
    if (snap.loading) fallbackSeen = true
    if (shownAt === null && snap.titles.includes(title)) shownAt = Date.now() - start
    if (shownAt !== null && !snap.loading) {
      mountedAt = Date.now() - start
      break
    }
    await wait(40)
  }
  const final = (await evaluate(ws, SNAPSHOT)).value
  return {
    button,
    title,
    shownAt,
    mountedAt,
    fallbackSeen,
    titles: final.titles,
    chunks: chunks.slice(beforeChunks)
  }
}

const chunks = []

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
  if (!ws) throw new Error('no pude conectarme por CDP')

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
      return
    }
    if (msg.method === 'Network.requestWillBeSent') {
      const url = msg.params?.request?.url ?? ''
      if (url.includes('/assets/') && /Panel|Explorer|editor/i.test(url)) {
        chunks.push(url.split('/').pop())
      }
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})
  void send(ws, 'Network.enable', {})

  await wait(2500)
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       return true
     })()`
  )
  await evaluate(ws, `window.location.reload()`)
  mainContextId = null
  // Vuelta lo más rápido posible: el preload por idle (timeout 3s) todavía no
  // corrió, así que el primer panel se abre EN FRÍO.
  await wait(3000)

  console.log('\n=== 1. apertura EN FRÍO (sin preload todavía) ===')
  const cold = await openAndMeasure(ws, TARGETS[0])
  console.log(
    `  ${cold.button}: título a los ${cold.shownAt}ms · montado a los ${cold.mountedAt}ms · fallback visto: ${cold.fallbackSeen}`
  )
  console.log(`  chunks del click: ${cold.chunks.length ? cold.chunks.join(', ') : '(ninguno)'}`)
  check('el panel en frío TERMINA de cargar (no queda colgado)', cold.mountedAt !== null, `${cold.mountedAt}ms`)

  console.log('\n=== 2. preload por idle ===')
  await wait(4000)
  const preloaded = [...new Set(chunks)]
  console.log(`  chunks de paneles ya descargados: ${preloaded.length}`)
  console.log(`  ${preloaded.join(', ')}`)
  check('el preload bajó varios paneles antes del click', preloaded.length >= 5, `${preloaded.length} chunks`)

  console.log('\n=== 3. aperturas con el preload hecho ===')
  const results = []
  for (const target of TARGETS.slice(1)) {
    const result = await openAndMeasure(ws, target)
    results.push(result)
    console.log(
      `  ${result.button.padEnd(8)} título ${String(result.shownAt).padStart(4)}ms · montado ${String(result.mountedAt).padStart(4)}ms · fallback ${result.fallbackSeen ? 'SÍ' : 'no'} · chunks ${result.chunks.length}`
    )
  }
  check(
    'ningún panel quedó colgado',
    results.every((r) => r.mountedAt !== null),
    results.filter((r) => r.mountedAt === null).map((r) => `${r.button} (headers: ${r.titles.join(' | ')})`).join(', ') ||
      'todos montaron'
  )
  check(
    'ninguno mostró el fallback (módulo ya precalentado)',
    results.every((r) => !r.fallbackSeen),
    results.filter((r) => r.fallbackSeen).map((r) => r.button).join(', ') || 'ninguno'
  )
  const slowest = Math.max(...results.map((r) => r.mountedAt ?? Infinity))
  check('el panel más lento montó en menos de 1s', slowest < 1000, `${slowest}ms`)

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

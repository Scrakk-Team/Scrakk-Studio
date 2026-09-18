/**
 * Probe: ¿el drag de los botones del header funciona de punta a punta?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PREGUNTA
 *
 * El drag de la activity bar ya está probado por sus tests de store; el del
 * header agrega una capa que el store no cubre: punteros reales. Este probe
 * arrastra con `Input.dispatchMouseEvent` (los mismos eventos del usuario) y
 * mide tres cosas que un test unitario no puede:
 *
 *   1. el DOM cambia de orden EN VIVO (el reorden no es sólo state),
 *   2. el orden se PERSISTE en localStorage,
 *   3. sobrevive a un reload y `Escape` cancela (restaura el snapshot).
 *
 * Uso:  node tools/_probe-header-actions-drag.mjs
 *
 * Es un artefacto de diagnóstico, no parte del producto.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-header-actions-drag'
const PORT = 9361
const STORAGE_KEY = 'scrakk-studio:header-actions'

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

async function evaluate(ws, expression, { awaitPromise = false } = {}) {
  const message = await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise,
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

/** Ids de los botones del header, en el orden REAL del DOM. */
const READ_ORDER = `(() => {
  const container = document.querySelector('[data-header-actions]')
  if (!container) return null
  return {
    ids: [...container.querySelectorAll('[data-header-action]')].map((el) => el.getAttribute('data-header-action')),
    rects: [...container.querySelectorAll('[data-header-action]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
  }
})()`

const READ_STORAGE = `(() => {
  try { return localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) } catch { return null }
})()`

async function mouse(ws, type, x, y, extra = {}) {
  await send(ws, 'Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1,
    ...extra
  })
}

/**
 * Arrastra el botón `fromIndex` hasta la mitad del botón `toIndex`, en pasos
 * cortos con pausa: el reorden es EN VIVO y necesita que React repinte entre
 * un move y el siguiente (si no, el índice se calcula contra un DOM viejo).
 */
async function dragButton(ws, layout, fromIndex, toIndex, { escape = false } = {}) {
  const from = layout.rects[fromIndex]
  const to = layout.rects[toIndex]
  await mouse(ws, 'mousePressed', from.x, from.y)
  const steps = 8
  for (let step = 1; step <= steps; step++) {
    const x = Math.round(from.x + ((to.x - from.x) * step) / steps)
    await mouse(ws, 'mouseMoved', x, from.y)
    await wait(60)
  }
  if (escape) {
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27
    })
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27
    })
    await wait(120)
  }
  await mouse(ws, 'mouseReleased', to.x, to.y)
  await wait(250)
}

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
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})

  // Onboarding afuera (el layout con headers sólo existe adentro).
  await wait(2500)
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       localStorage.removeItem(${JSON.stringify(STORAGE_KEY)})
       return true
     })()`
  )
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(6000)

  console.log('\n=== 1. header con botones ===')
  const layout = (await evaluate(ws, READ_ORDER)).value
  if (!layout) throw new Error('no encontré un header con botones [data-header-actions]')
  console.log(`  botones: ${layout.ids.join(' → ')}`)
  check('el header declara sus acciones', layout.ids.length >= 2, `${layout.ids.length} botones`)

  console.log('\n=== 2. arrastrar el ÚLTIMO al PRIMER lugar ===')
  const last = layout.ids.length - 1
  const expectedFirst = layout.ids[last]
  await dragButton(ws, layout, last, 0)
  const afterDrag = (await evaluate(ws, READ_ORDER)).value
  console.log(`  orden ahora: ${afterDrag.ids.join(' → ')}`)
  check('el DOM se reordenó en vivo', afterDrag.ids[0] === expectedFirst, `primero: ${afterDrag.ids[0]}`)

  console.log('\n=== 3. persistencia ===')
  const stored = (await evaluate(ws, READ_STORAGE)).value
  console.log(`  ${STORAGE_KEY} → ${stored}`)
  let parsed = {}
  try {
    parsed = JSON.parse(stored ?? '{}')
  } catch {
    parsed = {}
  }
  check(
    'el orden quedó guardado con la acción al frente',
    typeof parsed[expectedFirst]?.order === 'number' && parsed[expectedFirst].order === 10,
    JSON.stringify(parsed)
  )

  console.log('\n=== 4. sobrevive al reload ===')
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(6000)
  const afterReload = (await evaluate(ws, READ_ORDER)).value
  console.log(`  orden tras recargar: ${afterReload.ids.join(' → ')}`)
  check(
    'el header se pinta con el orden del usuario',
    afterReload.ids[0] === expectedFirst,
    `primero: ${afterReload.ids[0]}`
  )

  console.log('\n=== 5. Escape cancela el drag ===')
  const before = afterReload.ids
  const dragFrom = before.length - 1
  await dragButton(ws, afterReload, dragFrom, 0, { escape: true })
  const afterEscape = (await evaluate(ws, READ_ORDER)).value
  console.log(`  orden tras Escape: ${afterEscape.ids.join(' → ')}`)
  check(
    'Escape deja el orden como estaba',
    afterEscape.ids.join('|') === before.join('|'),
    `antes: ${before.join('|')} · después: ${afterEscape.ids.join('|')}`
  )

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

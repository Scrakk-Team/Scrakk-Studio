/**
 * Probe mínimo: ¿por qué el botón "chat" de la activity bar no abre el panel?
 *
 * Imprime todos los elementos con `[data-button-id]` (barra IZQUIERDA, barra
 * DERECHA y píldoras del ToolDock) y el estado de headers/tabs antes y
 * después del click, para distinguir "el click pegó en otro botón" de "el
 * click no hizo nada".
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-chat-button'
const PORT = 9411

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

const OUTLINE = `(() => {
  const buttons = [...document.querySelectorAll('[data-button-id]')].map((el, index) => ({
    index,
    id: el.dataset.buttonId,
    bar: el.closest('nav[data-side]')?.dataset.side ?? (el.closest('[data-tool-dock]') ? 'toolDock' : '?'),
    visible: el.getBoundingClientRect().width > 0,
    title: el.getAttribute('aria-label') ?? el.getAttribute('title') ?? ''
  }))
  const headers = [...document.querySelectorAll('header')].map((h) => ({
    text: (h.querySelector('span')?.textContent ?? '').trim(),
    actions: [...h.querySelectorAll('[data-header-action]')].map((a) => a.getAttribute('data-header-action'))
  }))
  const tabs = [...document.querySelectorAll('[role="tab"]')].map((el) => (el.textContent ?? '').trim())
  return { buttons, headers, tabs }
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
  await evaluate(ws, `window.location.reload()`)
  mainContextId = null
  await wait(7000)

  const before = (await evaluate(ws, OUTLINE)).value
  console.log('\n=== botones [data-button-id] ===')
  for (const button of before.buttons) {
    console.log(`  ${button.index}. ${button.id} (${button.bar}) visible=${button.visible} "${button.title}"`)
  }
  console.log(`\nheaders: ${JSON.stringify(before.headers)}`)
  console.log(`tabs: ${JSON.stringify(before.tabs)}`)

  /** Cuenta clicks reales que llegan al botón (capture, antes de React). */
  await evaluate(
    ws,
    `(() => {
       window.__clicks = []
       window.addEventListener('click', (event) => {
         const target = event.target?.closest?.('[data-button-id]')
         if (target) window.__clicks.push(target.dataset.buttonId)
       }, true)
       return true
     })()`
  )

  /** Click en un botón de la barra DERECHA y dump del estado. */
  const step = async (id, retry = false) => {
    const before = (await evaluate(ws, OUTLINE)).value
    await evaluate(ws, `document.querySelector('nav[data-side="right"] [data-button-id=${JSON.stringify(id)}]')?.click()`)
    await wait(1800)
    let after = (await evaluate(ws, OUTLINE)).value
    const same =
      JSON.stringify(after.headers) === JSON.stringify(before.headers) &&
      JSON.stringify(after.tabs) === JSON.stringify(before.tabs)
    if (same && retry) {
      console.log(`  (sin cambio: reintento el click en ${id})`)
      await evaluate(ws, `document.querySelector('nav[data-side="right"] [data-button-id=${JSON.stringify(id)}]')?.click()`)
      await wait(1800)
      after = (await evaluate(ws, OUTLINE)).value
    }
    const clicks = (await evaluate(ws, `JSON.stringify(window.__clicks)`)).value
    const layout = (await evaluate(
      ws,
      `localStorage.getItem('scrakk:layout.slots') ?? '(sin layout guardado)'`
    )).value
    console.log(`\n--- después de click en ${id} ---`)
    console.log(`  headers: ${after.headers.map((h) => h.text || '(vacío)').join(' | ')}`)
    console.log(`  tabs: ${JSON.stringify(after.tabs)}        clicks vistos: ${clicks}`)
    console.log(`  layout persistido: ${String(layout).slice(0, 700)}`)
  }

  console.log('\n=== secuencia: git → notes → chat → social → chat ===')
  for (const [index, id] of ['git', 'notes', 'chat', 'social', 'chat'].entries()) {
    await step(id, index > 0)
  }

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

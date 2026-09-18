/**
 * Probe: ¿por qué el slot derecho NO cambia de panel al clickear social / chat?
 *
 * Captura los console.* de la página (si el montaje del panel loguea un error,
 * acá se ve) y, después de cada click, dumpea:
 *  - cada `[data-slot]` con el título de su header y si hay loader,
 *  - el layout persistido (strips + activeId).
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-panel-swap'
const PORT = 9414

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
const logs = []

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

const SLOTS = `(() => {
  // Los slots son los <section> del layout (no tienen data-* estable).
  const slots = [...document.querySelectorAll('section')]
    .filter((el) => el.querySelector('header, [role="tab"]'))
    .map((el, index) => {
      const headers = [...el.querySelectorAll('header')].map((h) => ({
        text: (h.querySelector('span')?.textContent ?? '').trim(),
        actions: [...h.querySelectorAll('[data-header-action]')].map((a) => a.getAttribute('data-header-action'))
      }))
      const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => (t.textContent ?? '').trim())
      const box = el.getBoundingClientRect()
      return {
        slot: index + '@' + Math.round(box.left) + ',' + Math.round(box.top) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height),
        headers,
        tabs,
        loader: el.innerText.includes('Cargando panel'),
        bytes: el.innerText.replace(/\\s+/g, ' ').slice(0, 90)
      }
    })
  const layout = localStorage.getItem('scrakk:layout.slots') ?? '(vacío)'
  return { slots, layout }
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
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params?.args ?? [])
        .map((arg) => arg.value ?? arg.description ?? arg.preview?.description ?? '')
        .join(' ')
      if (text.trim()) logs.push(`[${msg.params.type}] ${text.slice(0, 400)}`)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push(`[throw] ${msg.params?.exceptionDetails?.exception?.description ?? ''}`)
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

  const click = (id) =>
    evaluate(
      ws,
      `(() => {
         const el = document.querySelector('[data-button-id=' + JSON.stringify(${JSON.stringify(id)}) + ']')
         if (!el) return false
         el.click()
         return true
       })()`
    )

  const step = async (id, settle = 1200) => {
    const clicked = (await click(id)).value
    await wait(settle)
    const state = (await evaluate(ws, SLOTS)).value
    const layout = JSON.parse(state.layout === '(vacío)' ? '{"slots":{}}' : state.layout)
    console.log(`\n--- click ${id} (click=${clicked}) ---`)
    for (const slot of state.slots) {
      const active = layout.slots?.[slot.slot]?.activeId ?? '?'
      const tabs = (layout.slots?.[slot.slot]?.tabs ?? []).map((t) => t.id).join(',')
      console.log(
        `  [${slot.slot}] header=${JSON.stringify(slot.headers.map((h) => h.text))}` +
          ` loader=${slot.loader} active=${active} tabs=[${tabs}]`
      )
      console.log(`         texto: ${slot.bytes}`)
    }
  }

  console.log('\n=== secuencia notes → social → chat → chat → social ===')
  await step('notes')
  await step('social')
  await step('chat')
  await step('chat')
  await step('social')

  console.log('\n=== console de la página ===')
  for (const line of logs.slice(-40)) console.log(`  ${line}`)

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

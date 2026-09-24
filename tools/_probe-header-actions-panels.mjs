// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe: ¿cada panel pinta sus botones de header?
 *
 * Recorre los botones de la activity bar, abre cada panel y lee el header
 * real: cuántos contenedores de acciones hay, qué botones tienen y con qué
 * label. Sirve para separar "el panel no declara acciones" de "las declara y
 * no se pintan".
 *
 * Uso:  node tools/_probe-header-actions-panels.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-header-actions-panels'
const PORT = 9371

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

/** Headers visibles + los botones de acción que tienen. */
const DUMP_HEADERS = `(() => {
  const frames = [...document.querySelectorAll('header')].map((header) => {
    const actions = header.querySelector('[data-header-actions]') ?? header.querySelector('div')
    const buttons = actions
      ? [...actions.querySelectorAll('button')].map((el) => el.getAttribute('aria-label') ?? el.textContent)
      : []
    return {
      title: header.querySelector('span')?.textContent ?? null,
      hasActionsContainer: !!header.querySelector('[data-header-actions]'),
      buttons
    }
  })
  return {
    frames,
    anyAction: document.querySelectorAll('[data-header-action]').length,
    tabStrips: document.querySelectorAll('[role="tablist"]').length,
    overflowButtons: [...document.querySelectorAll('button[aria-label^="Opciones de"]')].length
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
  if (!ws) throw new Error('no pude conectarme por CDP')

  const consoleErrors = []
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
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      consoleErrors.push(
        `[${msg.params.type}] ${(msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')}`
      )
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(`[exception] ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`)
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
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(6500)

  console.log('\n=== estado inicial del layout ===')
  const initial = (await evaluate(ws, DUMP_HEADERS)).value
  console.log(`  headers: ${JSON.stringify(initial.frames)}`)
  console.log(`  botones de acción en total: ${initial.anyAction}`)

  const buttons = (await evaluate(ws, `JSON.stringify([...document.querySelectorAll('[data-button-id]')].map((el) => el.dataset.buttonId))`)).value
  console.log(`\n=== botones de la activity bar: ${buttons} ===`)

  for (const id of JSON.parse(buttons ?? '[]')) {
    // Click (una o dos veces si el toggle lo cerró) y leer el header resultante.
    await evaluate(ws, `document.querySelector('[data-button-id=${JSON.stringify(id)}]')?.click()`)
    await wait(1200)
    let dump = (await evaluate(ws, DUMP_HEADERS)).value
    const expected = {
      chat: 'Chat',
      social: 'Social',
      git: 'Git',
      notes: 'Notas',
      explorer: 'Explorador',
      history: 'Línea de tiempo'
    }[id]
    if (expected && !dump.frames.some((f) => (f.title ?? '').includes(expected))) {
      await evaluate(ws, `document.querySelector('[data-button-id=${JSON.stringify(id)}]')?.click()`)
      await wait(1200)
      dump = (await evaluate(ws, DUMP_HEADERS)).value
    }
    console.log(`\n--- ${id} ---`)
    for (const frame of dump.frames) {
      console.log(
        `  header "${frame.title}" · contenedor=${frame.hasActionsContainer ? 'sí' : 'no'} · botones=${JSON.stringify(frame.buttons)}`
      )
    }
    console.log(`  acciones con [data-header-action]: ${dump.anyAction} · strips: ${dump.tabStrips} · ⋯: ${dump.overflowButtons}`)
  }

  if (consoleErrors.length > 0) {
    console.log('\n=== consola (errores/warnings) ===')
    for (const line of consoleErrors.slice(-25)) console.log(`  ${line}`)
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

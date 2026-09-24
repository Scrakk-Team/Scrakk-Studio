// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe: ¿el botón de la activity bar abre UN panel por slot?
 *
 * Bug que cierra: con el Explorador abierto, tocar Búsqueda apilaba una tab
 * nueva — el slot pasaba a la presentación de tabs (Explorador + Búsqueda)
 * en vez de reemplazar el panel que se estaba viendo.
 *
 * Mide en la app real, sobre el slot izquierdo:
 *
 *   1. al abrir el segundo panel hay UNA sola tab y ni un strip de tabs,
 *   2. el panel que se muestra es el nuevo,
 *   3. tocar de nuevo el mismo botón cierra el slot,
 *   4. el primer panel no quedó apilado en ningún lado.
 *
 * Uso:  node tools/_probe-slot-panel-swap.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-slot-panel-swap'
const PORT = 9391

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

/**
 * Estado global de headers y tabs. El bug se veía así: al abrir Búsqueda con
 * el Explorador abierto aparecía una TAB "Explorador" en el slot (stack) en
 * vez de reemplazarse el header. Por eso se leen las tabs de toda la app: si
 * alguna se llama Explorador/Búsqueda, el swap no pasó.
 */
const READ_STATE = `(() => {
  const headers = [...document.querySelectorAll('header')]
    .map((h) => (h.querySelector('span')?.textContent ?? '').trim())
    .filter(Boolean)
  const tabs = [...document.querySelectorAll('[role=\"tab\"]')].map((el) => (el.textContent ?? '').trim())
  return { headers, tabs }
})()`

async function clickBar(ws, id) {
  await evaluate(ws, `document.querySelector('[data-button-id=${JSON.stringify(id)}]')?.click()`)
  await wait(1400)
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
  await wait(6500)

  // Estado conocido: slot izquierdo con el Explorador.
  console.log('\n=== 1. dejarlo en Explorador ===')
  let state = (await evaluate(ws, READ_STATE)).value
  if (!state.headers.includes('Explorador')) {
    // Si estaba en otro panel, el primer click abre el Explorador.
    await clickBar(ws, 'explorer')
    state = (await evaluate(ws, READ_STATE)).value
  }
  console.log(`  headers: ${JSON.stringify(state.headers)}`)
  console.log(`  tabs: ${JSON.stringify(state.tabs)}`)
  check('el Explorador está abierto', state.headers.includes('Explorador'))

  console.log('\n=== 2. abrir Búsqueda (debe REEMPLAZAR) ===')
  await clickBar(ws, 'search')
  const after = (await evaluate(ws, READ_STATE)).value
  console.log(`  headers: ${JSON.stringify(after.headers)}`)
  console.log(`  tabs: ${JSON.stringify(after.tabs)}`)
  check('se ve el panel de Búsqueda', after.headers.includes('Búsqueda'), after.headers.join(', '))
  check('el Explorador NO quedó abierto al lado', !after.headers.includes('Explorador'), after.headers.join(', '))
  check(
    'no se creó una tab con los paneles del slot',
    !after.tabs.includes('Explorador') && !after.tabs.includes('Búsqueda'),
    `tabs=${JSON.stringify(after.tabs)}`
  )

  console.log('\n=== 3. volver al Explorador (reemplaza al revés) ===')
  await clickBar(ws, 'explorer')
  const back = (await evaluate(ws, READ_STATE)).value
  console.log(`  headers: ${JSON.stringify(back.headers)} · tabs: ${JSON.stringify(back.tabs)}`)
  check(
    'vuelve el Explorador y Búsqueda se fue',
    back.headers.includes('Explorador') && !back.headers.includes('Búsqueda'),
    back.headers.join(', ')
  )
  check(
    'sigue sin apilar tabs',
    !back.tabs.includes('Explorador') && !back.tabs.includes('Búsqueda'),
    `tabs=${JSON.stringify(back.tabs)}`
  )

  console.log('\n=== 4. el mismo botón cierra el slot ===')
  await clickBar(ws, 'explorer')
  const closed = (await evaluate(ws, READ_STATE)).value
  console.log(`  headers: ${JSON.stringify(closed.headers)}`)
  check('el Explorador se cerró', !closed.headers.includes('Explorador'), closed.headers.join(', '))

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

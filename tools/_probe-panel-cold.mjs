/**
 * Probe: apertura EN FRÍO de un panel (módulo todavía no importado).
 *
 * Se inyecta un script ANTES de que corra la app (`Page.addScriptToEvaluateOnNewDocument`)
 * que clickea el botón apenas existe — antes de que el preload en idle haya
 * calentado el módulo. Mide:
 *   - ms desde el click hasta que aparece el header del panel,
 *   - ms que el texto "Cargando panel…" estuvo visible (si aparece),
 *   - si quedó colgado (nunca aparece el header).
 *
 * Uso: node tools/_probe-panel-cold.mjs [panelId]
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PANEL = process.argv[2] ?? 'problems'
const LABEL = process.argv[3] ?? (PANEL === 'problems' ? 'Problemas' : PANEL)
const PROFILE = `release/_probe-cold-${PANEL}`
const PORT = 9415

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

/** Script que corre ANTES de la app: clickea el panel apenas aparece. */
const AUTOCLICK = `(() => {
  window.__cold = { pressedAt: null, headerAt: null, loader: [], requests: [] }
  const record = () => {
    const nodes = [...document.querySelectorAll('*')].filter(
      (el) => el.children.length === 0 && (el.textContent ?? '').trim() === 'Cargando panel…'
    )
    const visible = nodes.some((el) => el.getBoundingClientRect().height > 0)
    const last = window.__cold.loader[window.__cold.loader.length - 1]
    if (!last || last.visible !== visible) {
      window.__cold.loader.push({ at: Math.round(performance.now()), visible })
    }
  }
  const check = () => {
    if (window.__cold.pressedAt === null) {
      const el = document.querySelector('[data-button-id=${PANEL}]')
      if (el) {
        window.__cold.pressedAt = Math.round(performance.now())
        el.click()
      }
    }
    if (window.__cold.headerAt === null) {
      const ok = [...document.querySelectorAll('header span')].some(
        (s) => (s.textContent ?? '').trim() === ${JSON.stringify(LABEL)}
      )
      if (ok) window.__cold.headerAt = Math.round(performance.now())
    }
    record()
  }
  // En document-start documentElement todavia es null: se observa el
  // documento entero (el subtree cubre el html que esta por crearse).
  try {
    new MutationObserver(check).observe(document, {
      childList: true,
      subtree: true,
      characterData: true
    })
  } catch (error) {
    window.__cold.observeError = String(error)
  }
  setInterval(check, 16)
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
  // El script de autoclick sobrevive al reload.
  await send(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: AUTOCLICK })
  await evaluate(ws, `window.location.reload()`)
  mainContextId = null
  await wait(12_000)

  const cold = JSON.parse((await evaluate(ws, 'JSON.stringify(window.__cold)')).value ?? 'null')
  if (!cold) {
    console.log('[probe] no se pudo leer el estado frío')
  } else {
    console.log(`\npanel: ${PANEL} (label esperado: ${LABEL})`)
    console.log(`  click disparado en t=${cold.pressedAt} ms (desde el arranque de la página)`)
    console.log(
      `  header "${LABEL}" visible en t=${cold.headerAt} ms` +
        (cold.pressedAt !== null && cold.headerAt !== null
          ? `  → click → header: ${cold.headerAt - cold.pressedAt} ms`
          : '  → NUNCA apareció')
    )
    console.log('  "Cargando panel…":')
    for (const step of cold.loader) console.log(`    t=${step.at} ms visible=${step.visible}`)
    if (cold.loader.length === 0) console.log('    (nunca apareció)')
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

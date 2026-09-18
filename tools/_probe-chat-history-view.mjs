/**
 * Probe: ¿el historial vive DENTRO del panel de chat?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PREGUNTA
 *
 * El historial dejó de ser un panel suelto (tenía botón propio en la activity
 * bar, abría una tab aparte). Ahora es una vista embebida en el chat, movida
 * por el botón de su header. Tres cosas hay que comprobar en la app real:
 *
 *   1. la activity bar ya NO tiene el botón `history`,
 *   2. el header del chat tiene sus DOS acciones (historial + nuevo chat),
 *   3. al tocar el botón, el historial aparece ADENTRO del `main` del chat
 *      (misma tab/panel) y NO spawnea ninguna tab nueva: el layout no cambia.
 *
 * Uso:  node tools/_probe-chat-history-view.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-chat-history-view'
const PORT = 9381

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

/**
 * Estado del chat + del layout.
 * `paneInsideChat` es la prueba clave: la vista de historial tiene que ser
 * DESCENDIENTE del `<main>` del panel de chat (no un panel aparte).
 */
const READ_STATE = `(() => {
  const chatMain = document.querySelector('main[class*="screen"]')
  const chatHeader = chatMain
    ? chatMain.closest('div')?.parentElement?.querySelector('header') ?? chatMain.parentElement?.querySelector('header')
    : null
  const header = chatHeader ?? [...document.querySelectorAll('header')].find((h) => h.querySelector('[data-header-action="chat.new-session"]'))
  const aside = document.querySelector('[data-history-view]')
  return {
    activityBarButtons: [...document.querySelectorAll('[data-button-id]')].map((el) => el.dataset.buttonId),
    headerActions: header
      ? [...header.querySelectorAll('[data-header-action]')].map((el) => el.getAttribute('data-header-action'))
      : [],
    chatOpen: !!chatMain,
    historyOpen: !!aside,
    paneInsideChat: !!(chatMain && aside && chatMain.contains(aside)),
    historyHasContent: !!(aside && aside.querySelector('input[aria-label="Buscar chats"]')),
    historyButtons: aside
      ? [...aside.querySelectorAll('button')].map((el) => (el.textContent ?? '').trim()).filter(Boolean)
      : [],
    tabs: [...document.querySelectorAll('[role="tab"]')].map((el) => (el.textContent ?? '').trim()),
    panelsWithHistoryTitle: [...document.querySelectorAll('header span')].filter((el) => (el.textContent ?? '').trim() === 'Historial').length,
    geometry: (() => {
      if (!chatMain || !aside) return null
      const main = chatMain.getBoundingClientRect()
      const pane = aside.getBoundingClientRect()
      const form = chatMain.querySelector('form')
      const composer = form ? form.getBoundingClientRect() : null
      return {
        mainW: Math.round(main.width),
        paneW: Math.round(pane.width),
        paneLeft: Math.round(pane.left),
        paneRight: Math.round(pane.right),
        mainLeft: Math.round(main.left),
        mainRight: Math.round(main.right),
        composerW: composer ? Math.round(composer.width) : null,
        paneHeight: Math.round(pane.height)
      }
    })()
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
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(6500)

  // Asegurar el chat abierto (puede arrancar cerrado según el layout guardado).
  let state = (await evaluate(ws, READ_STATE)).value
  if (!state.chatOpen) {
    await evaluate(ws, `document.querySelector('[data-button-id="chat"]')?.click()`)
    await wait(1500)
    state = (await evaluate(ws, READ_STATE)).value
  }

  console.log('\n=== 1. activity bar ===')
  console.log(`  botones: ${state.activityBarButtons.join(', ')}`)
  check(
    'el historial ya NO está en la activity bar',
    !state.activityBarButtons.includes('history'),
    state.activityBarButtons.join(', ')
  )

  console.log('\n=== 2. header del chat ===')
  console.log(`  acciones: ${state.headerActions.join(', ')}`)
  check('el panel de chat está abierto', state.chatOpen)
  check(
    'el header del chat ofrece historial + nuevo chat',
    state.headerActions.includes('chat.history') && state.headerActions.includes('chat.new-session'),
    state.headerActions.join(', ')
  )

  console.log('\n=== 3. abrir el historial ===')
  const tabsBefore = state.tabs
  await evaluate(ws, `document.querySelector('[data-header-action="chat.history"]')?.click()`)
  await wait(1200)
  const opened = (await evaluate(ws, READ_STATE)).value
  console.log(
    `  historial abierto: ${opened.historyOpen} · adentro del chat: ${opened.paneInsideChat} · con contenido: ${opened.historyHasContent}`
  )
  console.log(`  tabs antes: ${JSON.stringify(tabsBefore)}`)
  console.log(`  tabs ahora: ${JSON.stringify(opened.tabs)}`)
  check('el historial se abrió', opened.historyOpen)
  check('el historial vive DENTRO del panel de chat', opened.paneInsideChat)
  check('el historial trae su componente real (buscador de chats)', opened.historyHasContent)
  console.log(`  botones del historial: ${JSON.stringify(opened.historyButtons)}`)
  check(
    'el botón de Ajustes ya no está en el historial',
    !opened.historyButtons.includes('Ajustes'),
    opened.historyButtons.join(', ')
  )
  check(
    'el botón de Proveedores se queda',
    opened.historyButtons.includes('Proveedores'),
    opened.historyButtons.join(', ')
  )
  check(
    'no se abrió como panel aparte (sin tab y sin header "Historial")',
    opened.panelsWithHistoryTitle === 0 && JSON.stringify(opened.tabs) === JSON.stringify(tabsBefore),
    `headers "Historial": ${opened.panelsWithHistoryTitle} · tabs: ${JSON.stringify(opened.tabs)}`
  )

  console.log('\n=== 3b. geometría de la vista ===')
  const geometry = opened.geometry
  console.log(`  ${JSON.stringify(geometry)}`)
  check(
    'el historial usa TODO el ancho del panel de chat',
    !!geometry && geometry.paneW >= geometry.mainW - 40,
    `pane=${geometry?.paneW}px · main=${geometry?.mainW}px`
  )
  check(
    'no se sale del panel de chat',
    !!geometry && geometry.paneLeft >= geometry.mainLeft - 1 && geometry.paneRight <= geometry.mainRight + 1,
    `pane=[${geometry?.paneLeft},${geometry?.paneRight}] · main=[${geometry?.mainLeft},${geometry?.mainRight}]`
  )
  check(
    'el historial ocupa el alto del panel (no se aplasta)',
    !!geometry && geometry.paneHeight > 200,
    `${geometry?.paneHeight}px`
  )
  check('el chat se ocultó mientras se ve el historial', opened.geometry?.composerW === null, `composer=${opened.geometry?.composerW}px`)

  console.log('\n=== 4. usar el historial cierra la vista y vuelve al chat ===')
  // "Nuevo chat" siempre existe (la lista puede estar vacía en un perfil
  // limpio); elegir una conversación se comporta igual: cierra la vista.
  await evaluate(
    ws,
    `[...document.querySelectorAll('[data-history-view] button')]
       .find((el) => (el.textContent ?? '').includes('Nuevo chat'))?.click()`
  )
  await wait(1000)
  const picked = (await evaluate(ws, READ_STATE)).value
  check('usar el historial vuelve al chat', picked.historyOpen === false)

  console.log('\n=== 5. el botón del header abre y cierra ===')
  await evaluate(ws, `document.querySelector('[data-header-action="chat.history"]')?.click()`)
  await wait(900)
  const reopened = (await evaluate(ws, READ_STATE)).value
  check('el botón lo vuelve a abrir', reopened.historyOpen === true)
  await evaluate(ws, `document.querySelector('[data-header-action="chat.history"]')?.click()`)
  await wait(900)
  const closed = (await evaluate(ws, READ_STATE)).value
  check('y lo vuelve a cerrar', closed.historyOpen === false)

  console.log('\n=== 6. el atajo (mod+alt+h) abre el chat con el historial ===')
  // Cerrar el panel de chat para probar el camino completo del comando.
  await evaluate(ws, `document.querySelector('[data-button-id="chat"]')?.click()`)
  await wait(1200)
  const hidden = (await evaluate(ws, READ_STATE)).value
  console.log(`  chat cerrado: ${!hidden.chatOpen}`)
  await send(ws, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'h',
    code: 'KeyH',
    windowsVirtualKeyCode: 72,
    nativeVirtualKeyCode: 72,
    modifiers: 3 // alt + ctrl
  })
  await send(ws, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'h',
    code: 'KeyH',
    windowsVirtualKeyCode: 72,
    nativeVirtualKeyCode: 72,
    modifiers: 3
  })
  await wait(1500)
  const shortcut = (await evaluate(ws, READ_STATE)).value
  check(
    'el atajo abre el chat con el historial adentro',
    shortcut.chatOpen && shortcut.historyOpen === true && shortcut.paneInsideChat === true,
    `chat=${shortcut.chatOpen} · historial=${shortcut.historyOpen} · adentro=${shortcut.paneInsideChat}`
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

/**
 * Probe temporal: recorre la PANTALLA DE CONFIGURACIÓN INICIAL en la app
 * compilada y reporta qué pinta cada paso.
 *
 * Perfil limpio (primer arranque) + CDP: dump del diálogo, avance paso por
 * paso, y una captura del paso de temas. Al final recarga para comprobar
 * que, una vez terminada, no se vuelve a abrir sola.
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-onboarding'
const PORT = 9334

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })

const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
if (!existsSync(electron)) {
  console.error('no encontré el binario de electron')
  process.exit(1)
}

const child = spawn(electron, ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':99', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe']
})
child.stdout.on('data', (chunk) => process.stdout.write(`[main] ${chunk}`))
child.stderr.on('data', (chunk) => process.stdout.write(`[err ] ${chunk}`))

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
    awaitPromise: true,
    returnByValue: true,
    ...(mainContextId === null ? {} : { contextId: mainContextId }),
    timeout: 60_000
  })
  if (!message) return { ok: false, error: 'sin respuesta de CDP' }
  if (message.error) return { ok: false, error: JSON.stringify(message.error) }
  const remote = message.result
  if (!remote) return { ok: false, error: `sin result: ${JSON.stringify(message)}` }
  if (remote.exceptionDetails) {
    return { ok: false, error: remote.exceptionDetails.exception?.description ?? remote.exceptionDetails.text }
  }
  if (remote.type === 'undefined') return { ok: true, value: undefined }
  return { ok: true, value: remote.value }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Dump del wizard: título, nav, paso actual y botones. */
const DUMP = `(() => {
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) return JSON.stringify({ open: false })
  const nav = [...dialog.querySelectorAll('nav button')].map((b) => b.textContent.trim())
  const headings = [...dialog.querySelectorAll('h2')].map((h) => h.textContent.trim())
  const buttons = [...dialog.querySelectorAll('footer button')].map((b) => b.textContent.trim())
  const panel = dialog
  const rect = panel.getBoundingClientRect()
  return JSON.stringify({
    open: true,
    title: dialog.getAttribute('aria-label'),
    nav,
    navCurrent: dialog.querySelector('[aria-current="step"]')?.textContent?.trim() ?? null,
    headings,
    badge:
      [...dialog.querySelectorAll('header span')]
        .map((s) => s.textContent.trim())
        .find((text) => text === 'Vista previa' || text === 'Se aplica ahora') ?? null,
    cards: dialog.querySelectorAll('[role="listitem"]').length,
    buttons,
    primary: dialog.querySelector('[aria-pressed="true"]')?.textContent?.trim() ?? null,
    summary: [...dialog.querySelectorAll('div')]
      .filter((d) => d.className.includes('summaryRow'))
      .map((d) => d.textContent.trim())
      .join(' / '),
    panel: Math.round(rect.width) + 'x' + Math.round(rect.height),
    scrollable: (() => {
      const col = dialog.querySelector('footer')?.parentElement
      return col ? col.scrollHeight > col.clientHeight : null
    })()
  })
})()`

/** Clic en una tarjeta del paso por su título (ej. un tema). */
const clickCard = (title) => `(() => {
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) return 'sin diálogo'
  const card = [...dialog.querySelectorAll('[role="listitem"]')].find(
    (c) => (c.textContent ?? '').trim().startsWith(${JSON.stringify(title)})
  )
  if (!card) return 'no encontré la tarjeta ' + ${JSON.stringify(title)}
  card.click()
  return 'ok'
})()`

/** Click en el interruptor del paso (aria-label: Compartir datos de uso). */
const clickSwitch = () => `(() => {
  const dialog = document.querySelector('[role="dialog"]')
  const toggle = dialog?.querySelector('[role="switch"]')
  if (!toggle) return 'sin interruptor'
  const before = toggle.getAttribute('aria-checked')
  toggle.click()
  return 'aria-checked ' + before + ' → ' + (before === 'true' ? 'false' : 'true')
})()`

/** Clic en un botón del footer por su texto. */
const clickFooter = (label) => `(() => {
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) return 'sin diálogo'
  const button = [...dialog.querySelectorAll('footer button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})
  if (!button) return 'sin botón ' + ${JSON.stringify(label)}
  if (button.disabled) return 'botón deshabilitado'
  button.click()
  return 'ok'
})()`

async function dump(ws, label) {
  const result = await evaluate(ws, DUMP)
  console.log(`\n=== ${label} ===`)
  if (!result.ok) {
    console.log('ERROR', result.error)
    return null
  }
  const parsed = JSON.parse(result.value)
  if (!parsed.open) {
    console.log('(el wizard NO está abierto)')
    return parsed
  }
  console.log(`título:    ${parsed.title}`)
  console.log(`nav:       ${parsed.nav.join(' · ')}`)
  console.log(`actual:    ${parsed.navCurrent}`)
  console.log(`h2:        ${parsed.headings.join(' | ')}`)
  console.log(`badge:     ${parsed.badge}`)
  console.log(`tarjetas:  ${parsed.cards}`)
  if (parsed.primary) console.log(`elegido:   ${parsed.primary}`)
  if (parsed.summary) console.log(`resumen:   ${parsed.summary}`)
  console.log(`panel:     ${parsed.panel}`)
  console.log(`botones:   ${parsed.buttons.join(' | ')}`)
  return parsed
}

async function screenshot(ws, file) {
  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  if (!shot?.data) {
    console.log('no pude capturar la pantalla')
    return
  }
  writeFileSync(join(PROFILE, file), Buffer.from(shot.data, 'base64'))
  console.log(`captura → ${join(PROFILE, file)}`)
}

async function main() {
  let ws
  for (let i = 0; i < 40; i++) {
    await wait(1500)
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.url.includes('index.html')) ?? list[0]
      if (!page?.webSocketDebuggerUrl) continue
      ws = new WebSocket(page.webSocketDebuggerUrl)
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true })
        ws.addEventListener('error', reject, { once: true })
      })
      break
    } catch {
      // todavía arrancando
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
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
      if (/onboarding|onboard/i.test(text)) console.log(`[renderer:${msg.params.type}] ${text}`)
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})

  for (let i = 0; i < 40; i++) {
    const ready = await evaluate(ws, `document.readyState === 'complete' && !!document.querySelector('#root')`)
    if (ready.value === true) break
    await wait(1000)
  }
  await wait(4000)

  await dump(ws, 'primer arranque (perfil limpio)')
  await screenshot(ws, 'paso-1.png')

  const steps = ['Apariencia', 'Privacidad', 'Atajos', 'Stack', 'Listo']
  for (let i = 0; i < steps.length; i++) {
    const clicked = await evaluate(ws, clickFooter('Siguiente'))
    console.log(`\n(siguiente → ${clicked.ok ? clicked.value : clicked.error})`)
    await wait(700)
    await dump(ws, steps[i])

    // ── Paso REAL 1: elegir un tema aplica y persiste ──
    if (steps[i] === 'Apariencia') {
      const picked = await evaluate(ws, clickCard('Dracula'))
      console.log(`(elegir tema → ${picked.ok ? picked.value : picked.error})`)
      await wait(900)
      await dump(ws, 'Apariencia (tras elegir Dracula)')
      await screenshot(ws, `paso-${i + 2}.png`)
      const stored = await evaluate(
        ws,
        `JSON.stringify({
          guardado: localStorage.getItem('scrakk-studio:active-theme'),
          acento: getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
        })`
      )
      console.log(`(tema persistido → ${stored.ok ? stored.value : stored.error})`)
    }

    // ── Paso fake: marcar dos capacidades (debe verse en el resumen) ──
    if (steps[i] === 'Stack') {
      for (const title of ['Git avanzado', 'Notebooks']) {
        const marked = await evaluate(ws, clickCard(title))
        console.log(`(marcar ${title} → ${marked.ok ? marked.value : marked.error})`)
        await wait(200)
      }
      await dump(ws, 'Stack (dos marcadas)')
    }

    // ── Paso REAL 2: la telemetría se guarda al instante ──
    if (steps[i] === 'Privacidad') {
      const toggled = await evaluate(ws, clickSwitch())
      console.log(`(encender telemetría → ${toggled.ok ? toggled.value : toggled.error})`)
      await wait(600)
      await dump(ws, 'Privacidad (tras encender)')
      const stored = await evaluate(
        ws,
        `JSON.stringify({ enabled: localStorage.getItem('scrakk:telemetry.enabled'), askedAt: localStorage.getItem('scrakk:telemetry.askedAt') })`
      )
      console.log(`(telemetría persistida → ${stored.ok ? stored.value : stored.error})`)
    }

    if (steps[i] === 'Listo') await screenshot(ws, `paso-${i + 2}.png`)
  }

  // Terminar: último paso cambia el botón primario.
  const finished = await evaluate(ws, clickFooter('Empezar a usar Scrakk'))
  console.log(`\n(empezar → ${finished.ok ? finished.value : finished.error})`)
  await wait(500)
  await dump(ws, 'después de terminar')

  // ¿Se vuelve a abrir sola al recargar?
  const reload = await evaluate(ws, `location.reload(), 'recargando'`)
  console.log(`\n(${reload.ok ? reload.value : reload.error})`)
  await wait(6000)
  await dump(ws, 'tras recargar (no debe abrirse sola)')
  const afterReload = await evaluate(
    ws,
    `JSON.stringify({
      paso: localStorage.getItem('scrakk:onboarding.step'),
      estado: localStorage.getItem('scrakk:onboarding.status'),
      telemetria: localStorage.getItem('scrakk:telemetry.enabled'),
      tema: localStorage.getItem('scrakk-studio:active-theme'),
      acento: getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
    })`
  )
  console.log(`persistencia → ${afterReload.ok ? afterReload.value : afterReload.error}`)

  // Reabrir a mano con el comando de la paleta: se abre la paleta, se filtra
  // por el título del comando y se lo ejecuta como lo haría el usuario.
  const reopen = await evaluate(
    ws,
    `window.dispatchEvent(new CustomEvent('open-command-palette')), 'paleta'`
  )
  console.log(`\n(${reopen.ok ? reopen.value : reopen.error})`)
  await wait(800)
  const found = await evaluate(
    ws,
    `(() => {
      const input = [...document.querySelectorAll('input')].find((i) => i.placeholder === 'Escribí un comando…')
      if (!input) return 'la paleta no abrió: ' + document.body.innerText.slice(0, 120).replace(/\\n/g, ' / ')
      return 'paleta abierta'
    })()`
  )
  console.log(`paleta: ${found.ok ? found.value : found.error}`)

  // Filtrar en la paleta (input controlado por React → setter nativo + input).
  const typed = await evaluate(
    ws,
    `(() => {
      const input = [...document.querySelectorAll('input')].find((i) => i.placeholder === 'Escribí un comando…')
      if (!input) return 'sin input'
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'configuración inicial')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return 'ok'
    })()`
  )
  console.log(`filtrar: ${typed.ok ? typed.value : typed.error}`)
  await wait(600)

  const clicked = await evaluate(
    ws,
    `(() => {
      const button = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes('Ver configuración inicial')
      )
      if (!button) return 'el comando no aparece en la paleta'
      button.click()
      return 'ok'
    })()`
  )
  console.log(`comando: ${clicked.ok ? clicked.value : clicked.error}`)
  await wait(700)
  await dump(ws, 'reabierta con el comando')

  child.kill('SIGTERM')
  await wait(1000)
  process.exit(0)
}

main().catch((error) => {
  console.error('PROBE FALLÓ:', error)
  child.kill('SIGTERM')
  process.exit(1)
})

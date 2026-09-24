// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe temporal: PANELES end-to-end en la app compilada.
 *
 * Qué verifica (todo sobre la app real, perfil limpio):
 *  1. Instalar un `.vsix` de verdad (`installVsix`) y ver el reporte de
 *     traducción (incluido `viewsWelcome`).
 *  2. Que la extensión APAREZCA en la activity bar (botón) y su panel monte.
 *  3. Que el ÁRBOL vacío muestre el `viewsWelcome` DE LA EXTENSIÓN y que su
 *     BOTÓN corra el comando real con sus argumentos.
 *  4. El mapa de comandos built-in: `workbench.action.openSettings` (abre
 *     Ajustes), `vscode.open` (abre un archivo) y `vscode.diff` (debe fallar
 *     con el motivo declarado, no con un "no existe").
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-panels'
const PROFILE_ABS = join(process.cwd(), PROFILE)
const WORKSPACE = process.cwd()
const PORT = 9334
const EXT_ID = 'vscode-scrakk-demo.demo-tree'
const VSIX = process.argv[2] ?? '/tmp/scrakk-demo-tree-1.0.0.vsix'

if (!existsSync(VSIX)) {
  console.error(`no encuentro el vsix: ${VSIX} (corré tools/_make-demo-vsix.mjs)`)
  process.exit(1)
}

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })
writeFileSync(join(PROFILE, 'probe.json'), JSON.stringify({ startedAt: new Date().toISOString() }))

const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
if (!existsSync(electron)) {
  console.error('no encontré el binario de electron')
  process.exit(1)
}

const child = spawn(
  electron,
  ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'],
  {
    env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':99', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  }
)

const mainLog = []
const record = (prefix, chunk) => {
  const text = chunk.toString()
  mainLog.push(`${prefix} ${text}`)
  process.stdout.write(`${prefix} ${text}`)
}
child.stdout.on('data', (chunk) => record('[main]', chunk))
child.stderr.on('data', (chunk) => record('[err ]', chunk))

async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const list = await res.json()
  return list.find((t) => t.type === 'page' && t.url.includes('index.html')) ?? list[0]
}

/** Errores de conexión visibles: un fallo mudo cuesta media hora de dudas. */
let connectionFailures = 0

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

async function evaluate(ws, expression, { awaitPromise = true } = {}) {
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
  if (message.result?.type === 'undefined') return { ok: true, value: undefined }
  return { ok: true, value: message.result?.value }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (label, ok, detail) =>
  console.log(`${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)

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
    } catch (error) {
      if (connectionFailures++ < 3) console.log('CDP todavía no:', error?.message ?? error)
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
    // Con recargas en el medio, el contexto viejo se destruye: si no se
    // limpia, el siguiente `evaluate` cae en un mundo muerto.
    if (msg.method === 'Runtime.executionContextDestroyed') {
      if (msg.params?.executionContextId === mainContextId) mainContextId = null
      return
    }
    if (msg.method === 'Runtime.executionContextsCleared') {
      mainContextId = null
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
      console.log(`[renderer:${msg.params.type}] ${text}`)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
    }
  })
  void send(ws, 'Runtime.enable', {})

  /** Espera a que el puente esté listo (sobrevive a recargas). */
  const waitForBridge = async () => {
    for (let i = 0; i < 60; i++) {
      const ready = await evaluate(
        ws,
        `document.readyState === 'complete' && !!window.api?.extensions?.host`,
        { awaitPromise: false }
      )
      if (ready.value === true) return true
      await wait(1000)
    }
    return false
  }
  await waitForBridge()

  /** Pide a la extensión de prueba que corra un comando (vía su host). */
  const run = (command, args = []) =>
    evaluate(
      ws,
      `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(EXT_ID)}, command: ${JSON.stringify(command)}, args: ${JSON.stringify(args)} })`
    )

  // ── 0. Estado previo: sin wizard y con telemetría ACTIVADA ────────────
  // Así el `env.isTelemetryEnabled` que ve la extensión es el del ajuste real
  // (el arranque lo publica: ver `publishTelemetryEnabled` en el boot).
  console.log('\n=== 0. preparar perfil (onboarding hecho + telemetría on) ===')
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:telemetry.enabled', JSON.stringify(true))
       localStorage.setItem('scrakk:telemetry.askedAt', JSON.stringify(Date.now()))
       return true
     })()`,
    { awaitPromise: false }
  )
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(4000)
  console.log('puente tras recargar:', await waitForBridge())

  // ── 1. Instalar el VSIX ────────────────────────────────────────────────
  console.log('\n=== 1. installVsix ===')
  const installed = await evaluate(
    ws,
    `window.api.extensions.installVsix(${JSON.stringify(VSIX)})`
  )
  console.log('install →', JSON.stringify(installed.value ?? installed.error)?.slice(0, 1200))
  const installOk = installed.ok && installed.value?.success === true
  check('el VSIX se instala', installOk)
  if (installOk) {
    // El reporte de instalación no trae el `mapped` completo, así que la
    // prueba de la traducción es el ARTEFACTO: el manifest SEF en disco.
    const manifestPath = join(PROFILE_ABS, 'extensions', EXT_ID, 'manifest.json')
    let welcomeContents = null
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const views = manifest?.contributes?.views ?? []
      welcomeContents = views[0]?.welcome?.[0]?.contents ?? null
    } catch (error) {
      console.log('no pude leer el manifest SEF:', error.message)
    }
    check(
      'el manifest SEF trae el contenido de vista vacía',
      String(welcomeContents ?? '').includes('Crear elemento'),
      String(welcomeContents ?? '').slice(0, 80)
    )
  }

  // El registro en el renderer lo hace la UI al instalar (`registerInstalledExtension`).
  // El probe instala por IPC, así que recarga: el boot vuelve a levantar las
  // extensiones instaladas (que es el camino que hace el usuario al reiniciar).
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(4000)
  await waitForBridge()
  await wait(3000)

  const button = await evaluate(
    ws,
    `JSON.stringify([...document.querySelectorAll('[data-button-id]')].map((el) => el.dataset.buttonId))`
  )
  console.log('botones de la activity bar →', button.value)
  const buttonId = `extview:${EXT_ID}:demo-side`
  check('la extensión pinta su botón', String(button.value ?? '').includes(buttonId), buttonId)

  // ── 2. Abrir el panel: árbol vacío + welcome de la extensión ────────────
  console.log('\n=== 2. panel + viewsWelcome ===')
  const opened = await evaluate(
    ws,
    `(() => {
       const el = document.querySelector('[data-button-id=${JSON.stringify(buttonId)}]')
       if (!el) return { clicked: false }
       el.click()
       return { clicked: true }
     })()`
  )
  check('click en el botón del contenedor', opened.value?.clicked === true)
  await wait(6000)

  const welcome = await evaluate(
    ws,
    `(() => {
       const box = document.querySelector('[data-ext-welcome="1"]')
       if (!box) {
         return { found: false, text: (document.body?.innerText ?? '').slice(-400) }
       }
       return {
         found: true,
         text: box.innerText,
         buttons: [...box.querySelectorAll('button')].map((b) => b.innerText)
       }
     })()`
  )
  console.log('welcome →', JSON.stringify(welcome.value))
  check('se ve el contenido de la EXTENSIÓN (no el mensaje del IDE)', welcome.value?.found === true)
  check(
    'el texto es el declarado',
    String(welcome.value?.text ?? '').includes('Sin elementos todavía.')
  )
  check('el botón del comando está', (welcome.value?.buttons ?? []).includes('Crear elemento'))

  // ── 3. El botón corre el comando REAL con sus args ─────────────────────
  console.log('\n=== 3. botón del welcome → comando ===')
  const clicked = await evaluate(
    ws,
    `(() => {
       const box = document.querySelector('[data-ext-welcome="1"]')
       const btn = box ? [...box.querySelectorAll('button')].find((b) => b.innerText === 'Crear elemento') : null
       if (!btn) return false
       btn.click()
       return true
     })()`
  )
  check('click en el botón del welcome', clicked.value === true)
  await wait(5000)
  // Los args de `viewsWelcome` los ESPARCE el host al llamar al comando (igual
  // que VS Code): el comando recibe sus elementos, así el único arg llega como
  // string `"saludo"`.
  const ran = mainLog.join('').includes('[demo] comando demo.create arg="saludo"')
  check('la extensión ejecutó el comando con los args del viewsWelcome', ran)

  // ── 3.1 Telemetría en vivo (valor al activar + cambio en caliente) ─────
  console.log('\n=== 3.1 telemetría ===')
  const stored = await evaluate(
    ws,
    `window.localStorage.getItem('scrakk:telemetry.enabled')`,
    { awaitPromise: false }
  )
  console.log('localStorage telemetry.enabled →', stored.value)
  await run('demo.report')
  await wait(1000)
  const activated = /\[demo\] report telemetria=(\w+)/.exec(mainLog.join(''))
  check('el host arranca con el ajuste REAL del IDE', activated?.[1] === 'true', activated?.[1])

  await evaluate(ws, `window.api.extensions.host.setTelemetryEnabled(false)`)
  const fired = await evaluate(ws, `typeof window.api.extensions.host.setTelemetryEnabled`)
  console.log('setTelemetryEnabled →', fired.value)
  await wait(1500)
  await run('demo.report')
  await wait(1000)
  const after = [...mainLog.join('').matchAll(/\[demo\] report telemetria=(\w+)/g)].pop()
  check('el cambio en caliente llega a la extensión', after?.[1] === 'false', after?.[1])
  check(
    'la extensión recibió el evento',
    mainLog.join('').includes('[demo] telemetria CAMBIO a false')
  )

  // ── 4. Comandos built-in de VS Code ───────────────────────────────────
  console.log('\n=== 4. comandos built-in ===')

  const settings = await run('workbench.action.openSettings', ['@ext:scrakk-demo.demo-tree'])
  check('workbench.action.openSettings no falla', settings.ok && settings.value?.success === true)
  await wait(2500)
  const settingsVisible = await evaluate(
    ws,
    `(() => {
       const dialogs = [...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText.slice(0, 120))
       return dialogs.some((text) => text.includes('Ajustes') || text.includes('Apariencia'))
     })()`
  )
  check('Ajustes se abrió de verdad', settingsVisible.value === true)
  await evaluate(ws, `window.dispatchEvent(new CustomEvent('close-settings'))`)
  await wait(500)

  const openTarget = join(WORKSPACE, 'package.json')
  const open = await run('vscode.open', [openTarget])
  check('vscode.open no falla', open.ok && open.value?.success === true)
  await wait(2500)
  const tab = await evaluate(ws, `document.body.innerText.includes('package.json')`)
  check('el archivo se abrió en una tab', tab.value === true)

  const diff = await run('vscode.diff', ['/tmp/a.ts', '/tmp/b.ts'])
  const diffError = String(diff.value?.error ?? diff.error ?? '')
  check(
    'vscode.diff falla DICIENDO el motivo',
    diffError.includes('vscode.diff') && diffError.includes('diff'),
    diffError.slice(0, 200)
  )

  const unknown = await run('comando.que.no.existe')
  const unknownError = String(unknown.value?.error ?? unknown.error ?? '')
  check('un id desconocido se distingue', unknownError.includes('no tiene el comando'), unknownError.slice(0, 120))

  // ── 5. Extensión REAL de árbol (opcional, segundo argumento) ──────────
  const realVsix = process.argv[3]
  if (realVsix && existsSync(realVsix)) {
    console.log('\n=== 5. extensión real de árbol ===')
    const realInstall = await evaluate(
      ws,
      `window.api.extensions.installVsix(${JSON.stringify(realVsix)})`
    )
    const realId = realInstall.value?.extension?.id
    console.log('install →', realId, JSON.stringify(realInstall.value?.compat ?? {}))
    if (realId) {
      await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
      mainContextId = null
      await wait(4000)
      await waitForBridge()
      await wait(3000)

      const buttons = await evaluate(
        ws,
        `JSON.stringify([...document.querySelectorAll('[data-button-id]')].map((el) => el.dataset.buttonId))`
      )
      const list = JSON.parse(buttons.value ?? '[]')
      const realButton = list.find((id) => String(id).includes(realId))
      check('la extensión real pinta su botón', Boolean(realButton), String(realButton))

      if (realButton) {
        await evaluate(
          ws,
          `(() => { document.querySelector('[data-button-id=${JSON.stringify(realButton)}]')?.click(); return true })()`,
          { awaitPromise: false }
        )
        await wait(8000)
        const panel = await evaluate(
          ws,
          `(() => {
             const host = document.querySelector('[data-ext-view]')
             if (!host) return { found: false, body: (document.body.innerText ?? '').slice(-300) }
             return {
               found: true,
               sections: [...host.querySelectorAll('[data-ext-section]')].map((s) => s.innerText.split('\\n')[0]),
               text: host.innerText.slice(0, 400)
             }
           })()`
        )
        console.log('panel real →', JSON.stringify(panel.value))
        check('el panel de la extensión real se montó', panel.value?.found === true)
        check(
          'las vistas del contenedor se apilan como secciones',
          (panel.value?.sections ?? []).length >= 2,
          JSON.stringify(panel.value?.sections)
        )
      }
    }
  } else if (realVsix) {
    console.log(`(sin extensión real: no encuentro ${realVsix})`)
  }

  await wait(3000)
  console.log('\n=== FIN DEL PROBE ===')
}

main()
  .catch((error) => {
    console.error('probe falló:', error)
  })
  .finally(async () => {
    try {
      child.kill('SIGKILL')
    } catch {
      // ya estaba muerto
    }
    await wait(500)
    console.log('\n=== log del main (últimas 160 líneas) ===')
    console.log(mainLog.join('').split('\n').slice(-160).join('\n'))
  })

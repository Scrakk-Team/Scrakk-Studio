/**
 * Probe temporal: SUBRAYADOS en la app compilada (píxeles, no promesas).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ VERIFICA Y POR QUÉ ASÍ
 *
 * Todo lo demás del canal de decoraciones se puede probar en tests (el payload
 * del host, el store, el empaquetado de sextupletes). Lo que NO se puede
 * probar sin el motor es lo único que el usuario ve: **que la ondulación esté
 * dibujada en el canvas**.
 *
 * Así que este probe:
 *   1. instala una extensión REAL que subraya (decoraciones + diagnósticos),
 *   2. abre un archivo de verdad en el editor,
 *   3. corre su comando,
 *   4. saca un screenshot y CUENTA PÍXELES del color de cada cosa dentro del
 *      canvas del editor (naranja de la decoración, rojo del error, ámbar del
 *      aviso), comparando contra el estado ANTES de decorar.
 *
 * Un "el payload llegó" con la pantalla limpia sería un verde falso; por eso el
 * assertion es sobre píxeles.
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-decorations'
const PORT = 9341
const DECO_VSIX = '/tmp/scrakk-decorations-1.0.0.vsix'
/** VSIX propio que sólo abre un archivo (ver tools/_make-openfile-vsix.mjs). */
const OPENER_VSIX = '/tmp/scrakk-openfile-1.0.0.vsix'
const SAMPLE = join(process.cwd(), 'probe-decorations-sample.ts')
const SAMPLE_NAME = 'probe-decorations-sample.ts'

for (const file of [DECO_VSIX, OPENER_VSIX]) {
  if (!existsSync(file)) {
    console.error(`no encuentro ${file} (corré tools/_make-decorations-vsix.mjs / _make-openfile-vsix.mjs)`)
    process.exit(1)
  }
}

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })
// 12 líneas: alcanzan para las líneas 1, 3 (decoración) y 5, 7, 9 (diagnósticos).
writeFileSync(
  SAMPLE,
  [
    '// Probe de subrayados: las líneas de abajo tienen que quedar marcadas',
    'const lineaUno = "decoracion naranja sobre esta linea 1"',
    '',
    'const lineaTres = "con hoverMessage"',
    '',
    'const lineaCinco = "ERROR del probe"',
    '',
    'const lineaSiete = "AVISO del probe"',
    '',
    'const lineaNueve = "PISTA del probe"',
    '',
    'export const fin = lineaUno'
  ].join('\n')
)

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

const cleanup = () => {
  try {
    child.kill('SIGKILL')
  } catch {
    // ya murió
  }
  rmSync(SAMPLE, { force: true })
}
process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(1)
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
let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

/** Cuenta píxeles "de un color" dentro del canvas del editor (PNG → canvas 2D). */
const COUNT = (base64, region, matches) => `(async () => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + ${JSON.stringify(base64)}
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const crop = ctx.getImageData(${region.x}, ${region.y}, ${Math.max(1, region.w)}, ${Math.max(1, region.h)}).data
  let hits = 0
  const seen = new Set()
  for (let i = 0; i < crop.length; i += 4) {
    const r = crop[i], g = crop[i + 1], b = crop[i + 2]
    seen.add(r + ',' + g + ',' + b)
    ${matches}
  }
  return { hits, colors: seen.size }
})()`

/** Naranja puro de `orange` (#ffa500): rojo alto, verde medio, azul bajo. */
const IS_ORANGE = `if (r > 180 && g > 110 && g < 200 && b < 90) hits++`
/** Rojo de error del tema (#f14c4c). */
const IS_ERROR_RED = `if (r > 170 && g < 120 && b < 125 && r - g > 70) hits++`
/** Ámbar de advertencia (#cca700). */
const IS_WARNING = `if (r > 150 && g > 120 && b < 90 && r - b > 90) hits++`
/**
 * Cian del rango VACÍO (#00e5ff). Se usa un color propio para poder
 * distinguirlo del naranja: el rango vacío mide UN carácter, así que el conteo
 * esperado es chico (decenas serían una decoración de otro rango).
 */
const IS_CYAN = `if (r < 130 && g > 180 && b > 200) hits++`

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
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
      if (text.includes('[deco-probe]')) console.log(`[renderer:${msg.params.type}] ${text}`)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})

  // Perfil limpio: onboarding afuera y raíz del explorador en este repo.
  await wait(2500)
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       localStorage.setItem('scrakk-studio:root-path', ${JSON.stringify(process.cwd())})
       return true
     })()`,
    { awaitPromise: false }
  )
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(5000)

  // ── 1. Instalar las dos extensiones ─────────────────────────────────────
  console.log('\n=== 1. instalar el VSIX de decoraciones ===')
  const installed = await evaluate(
    ws,
    `window.api.extensions.installVsix(${JSON.stringify(DECO_VSIX)})`
  )
  const info = installed.value
  check('el VSIX se instala', installed.ok && info?.success === true, info?.error)
  if (!info?.success) return
  const decoId = info.extension?.id
  console.log('  id:', decoId)

  const opener = await evaluate(
    ws,
    `window.api.extensions.installVsix(${JSON.stringify(OPENER_VSIX)})`
  )
  check('la extensión que abre archivos se instala', opener.value?.success === true, opener.value?.error)
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(5500)

  /** `ensure` arranca el Extension Host y corre su `activate` (como abrir su vista). */
  const ensure = (id) =>
    evaluate(
      ws,
      `window.api.extensions.host.ensure({ id: ${JSON.stringify(id)}, workspaceRoots: [${JSON.stringify(process.cwd())}], mode: 'compat' })`
    )
  const host = async (id, command, args) =>
    evaluate(
      ws,
      `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(id)}, command: ${JSON.stringify(command)}, args: ${JSON.stringify(args)} })`
    )

  // ── 2. Abrir el archivo de prueba ───────────────────────────────────────
  console.log('\n=== 2. abrir el archivo de prueba ===')
  const openerId = opener.value?.extension?.id
  // `executeCommand` NO levanta el host por su cuenta: en uso normal lo hace
  // abrir su vista/panel. Sin `ensure`, el probe se come un "no hay Extension
  // Host para …" y no prueba nada.
  const ensuredOpener = await ensure(openerId)
  check('el host de la extensión que abre archivos arranca', ensuredOpener.value?.success === true, JSON.stringify(ensuredOpener.value ?? ensuredOpener.error))
  const ensuredDeco = await ensure(decoId)
  check('el host de la extensión de decoraciones arranca', ensuredDeco.value?.success === true, JSON.stringify(ensuredDeco.value ?? ensuredDeco.error))
  await wait(3000)

  const opened = await host(openerId, 'demo.openFile', [SAMPLE])
  check('la extensión abrió el archivo', opened.value?.success !== false, JSON.stringify(opened.value ?? opened.error))

  let canvas = null
  for (let i = 0; i < 25; i++) {
    await wait(1200)
    const state = await evaluate(
      ws,
      `(() => {
         const el = document.querySelector('.scrakk-innerta-canvas')
         if (!el) return null
         const r = el.getBoundingClientRect()
         return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
       })()`,
      { awaitPromise: false }
    )
    if (state.value?.w > 100) {
      canvas = state.value
      break
    }
  }
  check('el editor montó el canvas', canvas !== null, JSON.stringify(canvas))
  if (!canvas) return

  // ── 3. Línea base: SIN decoraciones ─────────────────────────────────────
  console.log('\n=== 3. línea base (sin decoraciones) ===')
  await wait(1500)
  const before = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const baseOrange = await evaluate(ws, COUNT(before.data, canvas, IS_ORANGE))
  const baseRed = await evaluate(ws, COUNT(before.data, canvas, IS_ERROR_RED))
  const baseAmber = await evaluate(ws, COUNT(before.data, canvas, IS_WARNING))
  const baseCyan = await evaluate(ws, COUNT(before.data, canvas, IS_CYAN))
  console.log(
    `  naranja=${baseOrange.value?.hits} rojo=${baseRed.value?.hits} ámbar=${baseAmber.value?.hits} cian=${baseCyan.value?.hits} colores=${baseOrange.value?.colors}`
  )

  // ── 4. Correr el comando que subraya ────────────────────────────────────
  console.log('\n=== 4. demo.decorate ===')
  const report = await host(decoId, 'demo.decorate', [])
  // El resultado del comando viaja envuelto (`HostCommandResponse`).
  const result = report.value?.result ?? report.value
  console.log('  reporte:', JSON.stringify(result))
  check('el comando corrió en el host', report.value?.success === true, JSON.stringify(report.value))
  check('la extensión ve un editor activo', result?.hasEditor === true, JSON.stringify(result))
  check(
    'el editor ve el archivo de prueba',
    String(result?.path ?? '').endsWith(SAMPLE_NAME),
    result?.path
  )
  check('el editor expone setDecorations', result?.hasSetDecorations === true)
  check('el tipo de decoración tiene key', typeof result?.decorationKey === 'string', result?.decorationKey)
  check('la extensión publicó sus 3 diagnósticos', result?.diagnostics === 3)
  check('el tipo del rango vacío tiene key', typeof result?.emptyKey === 'string', result?.emptyKey)
  await wait(2500)

  // ── 5. Screenshot + conteo de píxeles ───────────────────────────────────
  console.log('\n=== 5. píxeles del canvas ===')
  const after = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  mkdirSync('release', { recursive: true })
  writeFileSync('release/_probe-decorations.png', Buffer.from(after.data, 'base64'))
  console.log('screenshot → release/_probe-decorations.png')

  const orange = await evaluate(ws, COUNT(after.data, canvas, IS_ORANGE))
  const red = await evaluate(ws, COUNT(after.data, canvas, IS_ERROR_RED))
  const amber = await evaluate(ws, COUNT(after.data, canvas, IS_WARNING))
  const cyan = await evaluate(ws, COUNT(after.data, canvas, IS_CYAN))
  console.log(
    `  naranja=${orange.value?.hits} (base ${baseOrange.value?.hits}) · rojo=${red.value?.hits} (base ${baseRed.value?.hits}) · ámbar=${amber.value?.hits} (base ${baseAmber.value?.hits}) · cian=${cyan.value?.hits} (base ${baseCyan.value?.hits})`
  )
  check(
    'hay subrayado NARANJA del tipo de decoración',
    (orange.value?.hits ?? 0) > (baseOrange.value?.hits ?? 0) + 20,
    `${baseOrange.value?.hits} → ${orange.value?.hits}`
  )
  check(
    'hay subrayado ROJO del diagnóstico de error',
    (red.value?.hits ?? 0) > (baseRed.value?.hits ?? 0) + 20,
    `${baseRed.value?.hits} → ${red.value?.hits}`
  )
  // El rango vacío mide UN carácter: el umbral es chico a propósito (un tramo
  // de 24 columnas daría cientos de píxeles, este unos pocos).
  check(
    'el rango VACÍO se dibuja con UN carácter de ancho',
    (cyan.value?.hits ?? 0) > (baseCyan.value?.hits ?? 0) + 4,
    `${baseCyan.value?.hits} → ${cyan.value?.hits}`
  )

  // ── 6. Limpiar: los subrayados tienen que IRSE ──────────────────────────
  console.log('\n=== 6. limpiar subrayados ===')
  await host(decoId, 'demo.clearDecorations', [])
  await wait(2500)
  const cleared = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const orangeAfter = await evaluate(ws, COUNT(cleared.data, canvas, IS_ORANGE))
  const redAfter = await evaluate(ws, COUNT(cleared.data, canvas, IS_ERROR_RED))
  const cyanAfter = await evaluate(ws, COUNT(cleared.data, canvas, IS_CYAN))
  console.log(
    `  naranja=${orangeAfter.value?.hits} rojo=${redAfter.value?.hits} cian=${cyanAfter.value?.hits}`
  )
  check(
    'al limpiar, el rango vacío también se va',
    (cyanAfter.value?.hits ?? 0) <= (baseCyan.value?.hits ?? 0) + 4,
    `${cyanAfter.value?.hits}`
  )
  check(
    'al limpiar, el naranja vuelve al nivel de base',
    (orangeAfter.value?.hits ?? 0) <= (baseOrange.value?.hits ?? 0) + 20,
    `${orangeAfter.value?.hits}`
  )
  check(
    'al limpiar, el rojo vuelve al nivel de base',
    (redAfter.value?.hits ?? 0) <= (baseRed.value?.hits ?? 0) + 20,
    `${redAfter.value?.hits}`
  )

  console.log(`\n${failures === 0 ? 'TOOO OK' : `${failures} fallo(s)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()

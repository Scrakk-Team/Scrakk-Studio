// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe: ¿dónde se corta la cadena LSP → subrayado?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PREGUNTA
 *
 * "El LSP anda (el hover responde) pero no se subraya nada." Esa frase tiene
 * cuatro eslabones y el síntoma se ve igual en los cuatro:
 *
 *   1. el SERVER no está corriendo (o falló el initialize),
 *   2. el server publica diagnósticos pero el MAIN no los rutea,
 *   3. llegan al renderer pero el store/adaptador no los toma, o
 *   4. llegan al motor pero el motor no dibuja.
 *
 * Este probe mide los cuatro POR SEPARADO:
 *   - `lspStatus()` → estado de cada server,
 *   - se suscribe `window.api.lsp.onDiagnostics` DESDE LA PÁGINA y cuenta lo que
 *     llega (eslabón 2), guardando los payloads,
 *   - lee el chip de Problemas y la cuenta de la statusbar (eslabón 3),
 *   - cuenta píxeles rojos en el canvas antes/después (eslabón 4).
 *
 * Uso:  node tools/_probe-lsp-underline.mjs
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-lsp-underline'
const WORKSPACE = '/tmp/scrakk-lsp-ws'
const PORT = 9343
const OPENER_VSIX = '/tmp/scrakk-openfile-1.0.0.vsix'
const CSS_FILE = join(WORKSPACE, 'style.css')

if (!existsSync(OPENER_VSIX)) {
  console.error(`no encuentro ${OPENER_VSIX} (corré tools/_make-openfile-vsix.mjs)`)
  process.exit(1)
}

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })
rmSync(WORKSPACE, { recursive: true, force: true })
mkdirSync(WORKSPACE, { recursive: true })
// CSS con DOS errores de sintaxis reales (verificados con el server de CSS):
// `color: ;` → property value expected · falta la `}` final → `}` expected.
writeFileSync(
  CSS_FILE,
  ['.caja {', '  color: ;', '  display: flex;', '', '.otra {', '  margin: 0;'].join('\n')
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

/** Píxeles ROJOS de error del tema (control cruzado: ver abajo). */
const COUNT_RED = (base64, region) => `(async () => {
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
  for (let i = 0; i < crop.length; i += 4) {
    const r = crop[i], g = crop[i + 1], b = crop[i + 2]
    if (r > 170 && g < 120 && b < 125 && r - g > 70) hits++
  }
  return hits
})()`

/**
 * Píxeles CIAN en el canvas.
 *
 * El color del subrayado de un error sale del TEMA (`--color-danger`) y el tema
 * puede tener rojos en el TEXTO (un valor, una keyword), así que "cuántos rojos
 * hay" no distingue el subrayado del texto. Antes de abrir el archivo el probe
 * reescribe `--color-danger` a cian: ningún tema pinta texto cian, así que
 * cualquier cian dentro del canvas ES el subrayado.
 */
const COUNT_CYAN = (base64, region) => `(async () => {
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
  for (let i = 0; i < crop.length; i += 4) {
    const r = crop[i], g = crop[i + 1], b = crop[i + 2]
    if (r < 130 && g > 180 && b > 200) hits++
  }
  return hits
})()`

/**
 * Perfil VERTICAL de los píxeles cian del canvas: la forma del trazo.
 *
 * "Hay cian" no distingue una ondulación de una raya recta (las dos pintan).
 * Esto devuelve, por columna con cian, las filas exactas que ocupa; con eso se
 * ve si el trazo sube y baja (onda) o si se queda en UNA fila (raya).
 */
const CYAN_PROFILE = (base64, region) => `(async () => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + ${JSON.stringify(base64)}
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const x0 = ${region.x}, y0 = ${region.y}, w = ${Math.max(1, region.w)}, h = ${Math.max(1, region.h)}
  const crop = ctx.getImageData(x0, y0, w, h)
  const columns = []
  const rowsUsed = new Set()
  for (let x = 0; x < w; x++) {
    const rows = []
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4
      const r = crop.data[i], g = crop.data[i + 1], b = crop.data[i + 2]
      if (r < 130 && g > 180 && b > 200) { rows.push(y0 + y); rowsUsed.add(y0 + y) }
    }
    if (rows.length > 0) columns.push({ x: x0 + x, rows: rows.map((v) => v - y0) })
  }
  // ASCII del trazo medido (bbox de los píxeles cian): la prueba visual que
  // distingue "onda" de "raya" sin tener que mirar una captura.
  let art = []
  if (columns.length > 0) {
    const cx0 = columns[0].x, cx1 = columns[columns.length - 1].x
    const minRow = Math.min(...columns.flatMap((c) => c.rows))
    const maxRow = Math.max(...columns.flatMap((c) => c.rows))
    const set = new Set(columns.flatMap((c) => c.rows.map((r) => c.x + ':' + r)))
    for (let r = minRow; r <= maxRow; r++) {
      let line = ''
      for (let x = cx0; x <= cx1; x++) line += set.has(x + ':' + r) ? '#' : '.'
      art.push(line)
    }
  }
  return {
    columns: columns.length,
    rows: [...rowsUsed].sort((a, b) => a - b).map((v) => v - y0),
    art,
    // Comprimido para imprimir: columna→filas (solo si hay pocas columnas)
    sample: columns.slice(0, 120).map((c) => c.rows.join('/'))
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
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
      if (text.includes('[lsp') || text.includes('[deco')) {
        console.log(`[renderer:${msg.params.type}] ${text}`)
      }
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})

  // Onboarding afuera + raíz del explorador en el workspace de prueba.
  await wait(2500)
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       localStorage.setItem('scrakk-studio:root-path', ${JSON.stringify(WORKSPACE)})
       // El subrayado de un error toma su color del tema: lo llevamos a CIAN
       // para poder contarlo sin confundirlo con el rojo del TEXTO.
       document.documentElement.style.setProperty('--color-danger', '#00e5ff')
       return true
     })()`,
    { awaitPromise: false }
  )
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(5000)

  // ── Instrumento: ESPÍA del canal de diagnósticos (eslabón 2) ────────────
  const spy = await evaluate(
    ws,
    `(() => {
       window.__lspLog = []
       window.__lspUnsub = window.api.lsp.onDiagnostics((payload) => {
         window.__lspLog.push({
           server: payload.serverName,
           path: payload.path,
           count: (payload.diagnostics ?? []).length,
           severity: (payload.diagnostics ?? []).map((d) => d.severity),
           detail: (payload.diagnostics ?? []).map((d) => ({
             msg: (d.message ?? '').slice(0, 40),
             range: [d.range.start.line, d.range.start.character, d.range.end.line, d.range.end.character],
             empty: d.range.start.line === d.range.end.line && d.range.start.character === d.range.end.character
           }))
         })
       })
       return typeof window.__lspUnsub === 'function'
     })()`,
    { awaitPromise: false }
  )
  check('me suscribí al canal lsp:on-diagnostics desde la página', spy.value === true, spy.error)

  // ── 1. Estado de los servers (eslabón 1) ────────────────────────────────
  console.log('\n=== 1. servers ===')
  const status = await evaluate(ws, `window.api.lsp.status()`, { awaitPromise: true })
  console.log('  lspStatus →', JSON.stringify(status.value)?.slice(0, 600))

  // ── 2. Abrir el CSS roto ────────────────────────────────────────────────
  console.log('\n=== 2. abrir el CSS roto ===')
  const opener = await evaluate(
    ws,
    `window.api.extensions.installVsix(${JSON.stringify(OPENER_VSIX)})`
  )
  const openerId = opener.value?.extension?.id
  check('la extensión que abre archivos está', typeof openerId === 'string', openerId)
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(5500)

  // El espía se re-instala: el reload borró la suscripción anterior.
  await evaluate(
    ws,    `(() => {
       window.__lspLog = []
       document.documentElement.style.setProperty('--color-danger', '#00e5ff')
       window.api.lsp.onDiagnostics((payload) => {
           window.__lspLog.push({
             server: payload.serverName,
             path: payload.path,
             count: (payload.diagnostics ?? []).length,
             severity: (payload.diagnostics ?? []).map((d) => d.severity),
             detail: (payload.diagnostics ?? []).map((d) => ({
               msg: (d.message ?? '').slice(0, 40),
               range: [d.range.start.line, d.range.start.character, d.range.end.line, d.range.end.character],
               empty: d.range.start.line === d.range.end.line && d.range.start.character === d.range.end.character
             }))
           })
         })
       localStorage.setItem('scrakk-studio:root-path', ${JSON.stringify(WORKSPACE)})
       return true
     })()`,
    { awaitPromise: false }
  )

  const ensured = await evaluate(
    ws,
    `window.api.extensions.host.ensure({ id: ${JSON.stringify(openerId)}, workspaceRoots: [${JSON.stringify(WORKSPACE)}], mode: 'compat' })`
  )
  check('el Extension Host arranca', ensured.value?.success === true, JSON.stringify(ensured.value ?? ensured.error))
  await evaluate(
    ws,
    `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(openerId)}, command: 'demo.openFolder', args: [${JSON.stringify(WORKSPACE)}] })`
  )
  await wait(3000)
  const opened = await evaluate(
    ws,
    `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(openerId)}, command: 'demo.openFile', args: [${JSON.stringify(CSS_FILE)}] })`
  )
  check('el CSS se abrió', opened.value?.success !== false, JSON.stringify(opened.value ?? opened.error))

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

  // ── LÍNEA BASE: el archivo ya está abierto y el server todavía NO publicó ─
  // Sin esto, el rojo medido después no distingue el subrayado del color de
  // texto del tema (que también tiene rojos). Se mide el MISMO canvas dos
  // veces: el texto no cambia entre las dos, el subrayado sí.
  console.log('\n=== 2b. línea base (sin diagnósticos todavía) ===')
  const baselineShot = canvas ? await send(ws, 'Page.captureScreenshot', { format: 'png' }) : null
  const baselineCyan =
    canvas && baselineShot ? await evaluate(ws, COUNT_CYAN(baselineShot.data, canvas)) : null
  const baselineRed =
    canvas && baselineShot ? await evaluate(ws, COUNT_RED(baselineShot.data, canvas)) : null
  console.log(
    `  cian en el canvas (base): ${baselineCyan?.value} · rojo (base): ${baselineRed?.value}`
  )

  // Se le da tiempo al server de CSS a arrancar y publicar (el paso 5 vuelve a
  // medir en bucle, así que esto es solo el margen inicial).
  console.log('\n  esperando al server (12 s)…')
  await wait(12_000)

  // ── 3. ¿Llegaron diagnósticos a la PÁGINA? (eslabón 2) ──────────────────
  console.log('\n=== 3. canal lsp:on-diagnostics ===')
  const log = await evaluate(ws, `JSON.stringify(window.__lspLog ?? [])`, { awaitPromise: false })
  const events = JSON.parse(log.value ?? '[]')
  console.log(`  eventos recibidos: ${events.length}`)
  for (const event of events.slice(-8)) {
    console.log(`   · ${event.server} ${event.path} → ${event.count} diagnósticos ${JSON.stringify(event.severity)}`)
    for (const detail of event.detail ?? []) {
      console.log(`      [${detail.range.join(',')}] ${detail.empty ? 'VACÍO' : 'rango'} · ${detail.msg}`)
    }
  }
  const forFile = events.filter((e) => String(e.path).endsWith('style.css'))
  check(
    'el canal lsp:on-diagnostics entregó algo para style.css',
    forFile.some((e) => e.count > 0),
    `eventos para el archivo: ${forFile.length} (${forFile.map((e) => e.count).join(', ')})`
  )

  const status2 = await evaluate(ws, `window.api.lsp.status()`)
  console.log('  lspStatus (después) →', JSON.stringify(status2.value)?.slice(0, 600))

  // ── 4. ¿Lo tomó el renderer? (eslabón 3) ────────────────────────────────
  console.log('\n=== 4. UI de problemas ===')
  const chips = await evaluate(
    ws,
    `(() => {
       const title = (sel) => document.querySelector(sel)?.getAttribute('title') ?? null
       return JSON.stringify({
         lsp: title('[aria-label="Estado de language servers"]'),
         problems: title('[aria-label="Problemas"]')
       })
     })()`,
    { awaitPromise: false }
  )
  console.log('  chips (título real) →', chips.value)

  // ── 5. ¿Se subrayó? (eslabón 4) ─────────────────────────────────────────
  console.log('\n=== 5. píxeles del canvas ===')
  if (canvas) {
    // El server puede tardar: se mide hasta 60 s buscando el DELTA sobre la
    // línea base (el texto no cambia entre las dos, el subrayado sí).
    let cyan = null
    let red = null
    let shot = null
    for (let attempt = 0; attempt < 20; attempt++) {
      shot = await send(ws, 'Page.captureScreenshot', { format: 'png' })
      cyan = await evaluate(ws, COUNT_CYAN(shot.data, canvas))
      red = await evaluate(ws, COUNT_RED(shot.data, canvas))
      console.log(
        `  intento ${attempt + 1}: cian=${cyan.value} (base ${baselineCyan?.value}) · rojo=${red.value} (base ${baselineRed?.value})`
      )
      if ((cyan.value ?? 0) > 4) break
      await wait(3000)
    }
    mkdirSync('release', { recursive: true })
    writeFileSync('release/_probe-lsp-underline.png', Buffer.from(shot.data, 'base64'))
    // Cian = el subrayado con el color forzado. Rojo por encima de la base =
    // el subrayado igual se dibujó pero con el color del tema (o sea: el tema
    // volvió a aplicar sus vars entre la publicación y la medición).
    const paintedCyan = (cyan.value ?? 0) > 4
    const paintedRed = (red.value ?? 0) > (baselineRed?.value ?? 0) + 5
    check(
      'el subrayado del diagnóstico se DIBUJA',
      paintedCyan || paintedRed,
      paintedCyan
        ? `cian ${baselineCyan?.value} → ${cyan.value}`
        : `rojo ${baselineRed?.value} → ${red.value}`
    )

    // ── 5b. FORMA del trazo: ¿onda o raya? ──────────────────────────────
    console.log('\n=== 5b. forma del subrayado ===')
    const profile = await evaluate(ws, CYAN_PROFILE(shot.data, canvas))
    const shape = profile.value
    if (!shape || shape.columns === 0) {
      check('medí la forma del subrayado', false, JSON.stringify(shape ?? profile.error))
    } else {
      console.log(`  filas ocupadas (relativas al canvas): ${JSON.stringify(shape.rows)}`)
      console.log(`  perfil columna a columna: ${shape.sample.slice(0, 48).join(' | ')}`)
      console.log('  forma medida (cada # es un píxel del subrayado):')
      for (const line of shape.art ?? []) console.log(`    ${line}`)
      // Raya recta = 1 sola fila en TODAS las columnas. Onda = el trazo cambia
      // de fila (VS Code: 3 filas, sierra de 6px de periodo).
      const distinctTop = new Set(shape.sample.map((rows) => rows.split('/')[0]))
      check(
        'el subrayado es ONDULADO (ocupa varias filas y sube/baja)',
        shape.rows.length >= 3 && distinctTop.size >= 2,
        `filas=${shape.rows.length} · fila superior distinta en ${distinctTop.size} tramos`
      )
    }
  }

  console.log(`\n${failures === 0 ? 'TOOO OK' : `${failures} fallo(s)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()

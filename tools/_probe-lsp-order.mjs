/**
 * Probe: ¿CUÁNTO tarda un diagnóstico desde la tecla?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ MIDE (y por qué así)
 *
 * "Los errores aparecen después de guardar" es un síntoma, no un dato. La
 * cadena tiene TRES tramos y el total no dice cuál está lento:
 *
 *   1. tecla → `notifyFileChanged` del renderer   (el debounce del sync),
 *   2. notify → `publishDiagnostics` del server   (el trabajo del server),
 *   3. evento → subrayado                          (store + motor).
 *
 * El probe tipea DE VERDAD (CDP `Input.dispatchKeyEvent` sobre el canvas
 * enfocado, como el usuario), envuelve `window.api.lsp.notifyFileChanged` para
 * fechar el tramo 1, y escucha `lsp:on-diagnostics` para fechar el 2. Después
 * imprime la tabla de latencias en vez de una opinión.
 *
 * Uso:  node tools/_probe-lsp-realtime.mjs
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-lsp-realtime'
const WORKSPACE = '/tmp/scrakk-realtime-ws'
const PORT = 9344
const OPENER_VSIX = '/tmp/scrakk-openfile-1.0.0.vsix'
const CSS_FILE = join(WORKSPACE, 'style.css')
/** Segundo archivo, para el experimento de UNA sola tecla. */
const ORDER_FILE = join(WORKSPACE, 'order.css')
/** Tercero: un CSS que YA está roto en disco (se abre y no se toca nada). */
const BROKEN_FILE = join(WORKSPACE, 'broken.css')

if (!existsSync(OPENER_VSIX)) {
  console.error(`no encuentro ${OPENER_VSIX} (corré tools/_make-openfile-vsix.mjs)`)
  process.exit(1)
}

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })
rmSync(WORKSPACE, { recursive: true, force: true })
mkdirSync(WORKSPACE, { recursive: true })
// Archivo VÁLIDO: la línea base de diagnósticos es 0, así que cualquier cosa
// que aparezca después de tipear es causada por el tipeo.
writeFileSync(CSS_FILE, ['body {', '  color: red;', '}'].join('\n'))
// Limpio y de UNA línea: un Backspace sobre el `}` final lo rompe con una
// sola tecla (el server reporta `} expected` en esa misma línea).
writeFileSync(ORDER_FILE, 'body { color: red; }')
writeFileSync(BROKEN_FILE, ['body {', '  color: ;', '}'].join('\n'))

const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
const child = spawn(
  electron,
  ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'],
  {
    env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':99', NODE_ENV: 'production', SCRAKK_LSP_DEBUG: '1' },
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

async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const list = await res.json()
  return list.find((t) => t.type === 'page' && t.url.includes('index.html')) ?? list[0]
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Píxeles CIAN del canvas: el subrayado con el color del error forzado a cian. */
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
    if (r < 150 && g > 170 && b > 190) hits++
  }
  return hits
})()`
let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

/** Tecla como la manda un teclado real (el motor lee `e.key` y `e.code`). */
async function pressKey(ws, key, { code, vk, modifiers = 0, text } = {}) {
  const payload = {
    type: 'keyDown',
    key,
    code: code ?? `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: vk ?? key.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: vk ?? key.toUpperCase().charCodeAt(0),
    modifiers
  }
  if (typeof text === 'string') payload.text = text
  await send(ws, 'Input.dispatchKeyEvent', payload)
  await send(ws, 'Input.dispatchKeyEvent', { ...payload, type: 'keyUp' })
}

/** Tipea un texto carácter por carácter, con pausa de tipeo humano. */
const KEYS = {
  '{': { key: '{', code: 'BracketLeft', vk: 219, modifiers: 8, text: '{' },
  '}': { key: '}', code: 'BracketRight', vk: 221, modifiers: 8, text: '}' },
  ':': { key: ':', code: 'Semicolon', vk: 186, modifiers: 8, text: ':' },
  ';': { key: ';', code: 'Semicolon', vk: 186, modifiers: 0, text: ';' },
  ' ': { key: ' ', code: 'Space', vk: 32, modifiers: 0, text: ' ' },
  '\n': { key: 'Enter', code: 'Enter', vk: 13, modifiers: 0 }
}

async function typeText(ws, text, perKeyMs = 25) {
  for (const char of text) {
    const spec = KEYS[char] ?? { key: char, text: char }
    await pressKey(ws, spec.key, spec)
    await wait(perKeyMs)
  }
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
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
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
       localStorage.setItem('scrakk-studio:root-path', ${JSON.stringify(WORKSPACE)})
       return true
     })()`,
    { awaitPromise: false }
  )
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(5000)

  // ── Abrir el CSS con la extensión de siempre ────────────────────────────
  const opener = await evaluate(ws, `window.api.extensions.installVsix(${JSON.stringify(OPENER_VSIX)})`)
  const openerId = opener.value?.extension?.id
  check('la extensión que abre archivos está', typeof openerId === 'string', openerId)
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(5500)

  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk-studio:root-path', ${JSON.stringify(WORKSPACE)})
       // Color del error a CIAN para poder contarlo en píxeles (va DESPUÉS del
       // reload: un style en <html> no sobrevive a la recarga).
       document.documentElement.style.setProperty('--color-danger', '#00e5ff')
       // Instrumento: fechas de cada notifyFileChanged del renderer (tramo 1).
       window.__notify = []
       window.__diag = []
       const original = window.api.lsp.notifyFileChanged.bind(window.api.lsp)
       window.api.lsp.notifyFileChanged = (path, content) => {
         window.__notify.push({ t: performance.now(), path, len: content.length, tail: content.slice(-24) })
         return original(path, content)
       }
       window.api.lsp.onDiagnostics((payload) => {
         window.__diag.push({
           t: performance.now(),
           path: payload.path,
           count: (payload.diagnostics ?? []).length,
           msgs: (payload.diagnostics ?? []).map((d) => d.message)
         })
       })
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
  await wait(2500)
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

  console.log('\n  esperando al server de CSS (10 s)…')
  await wait(10_000)
  const status = await evaluate(ws, `window.api.lsp.status()`)
  const css = (status.value ?? []).find((s) => s.name === 'css')
  check('el server de CSS está ready', css?.state === 'ready', JSON.stringify(css ?? {}))
  const baseline = await evaluate(ws, `JSON.stringify(window.__diag)`)
  console.log(`  diagnósticos antes de tipear: ${baseline.value}`)

  // ── Foco + caret al final del archivo ──────────────────────────────────
  const focused = await evaluate(
    ws,
    `(() => {
       const el = document.querySelector('.scrakk-innerta-canvas')
       if (!el) return false
       el.focus()
       return document.activeElement === el
     })()`,
    { awaitPromise: false }
  )
  check('el canvas tiene el foco', focused.value === true, String(focused.value))
  // Ctrl+End: final del archivo (GLFW_KEY_END + mods=CTRL).
  await pressKey(ws, 'End', { code: 'End', vk: 35, modifiers: 2 })
  await wait(300)

  // ── EL EXPERIMENTO: tipear CSS roto ────────────────────────────────────
  // `body { color: ; }` al final → el server de CSS debe publicar
  // "property value expected" en el `;`.
  console.log('\n=== 1. tipeo (sin guardar) ===')
  const beforeNotify = await evaluate(ws, `window.__notify.length`, { awaitPromise: false })
  const beforeDiag = await evaluate(ws, `window.__diag.length`, { awaitPromise: false })
  await typeText(ws, '\nbody { color: ; }')
  const tLastKey = await evaluate(ws, `performance.now()`, { awaitPromise: false })
  console.log(`  tipeado; última tecla en t=${Math.round(tLastKey.value)} ms`)

  let notifyAt = null
  let diagAt = null
  for (let i = 0; i < 60; i++) {
    await wait(100)
    const state = await evaluate(
      ws,
      `JSON.stringify({
         notify: window.__notify.slice(${beforeNotify.value ?? 0}),
         diag: window.__diag.slice(${beforeDiag.value ?? 0})
       })`,
      { awaitPromise: false }
    )
    const parsed = JSON.parse(state.value ?? '{}')
    if (!notifyAt && parsed.notify?.length) notifyAt = parsed.notify[parsed.notify.length - 1]
    const hit = (parsed.diag ?? []).find((d) => String(d.path).endsWith('style.css') && d.count > 0)
    if (hit) {
      diagAt = hit
      break
    }
  }

  const keyT = tLastKey.value ?? 0
  if (notifyAt) {
    console.log(`  notifyFileChanged #${notifyAt.len} chars a +${Math.round(notifyAt.t - keyT)} ms de la tecla`)
  } else {
    console.log('  ✗ el renderer NUNCA mandó notifyFileChanged al tipear')
  }
  if (diagAt) {
    console.log(
      `  diagnóstico con ${diagAt.count} problema(s) a +${Math.round(diagAt.t - keyT)} ms de la tecla` +
        ` (${Math.round(diagAt.t - (notifyAt?.t ?? keyT))} ms después del notify)`
    )
    console.log(`    ${JSON.stringify(diagAt.msgs)}`)
  } else {
    console.log('  ✗ NO llegó ningún diagnóstico al tipear (ni en 6 s)')
  }
  check('tipear produce diagnóstico SIN guardar', Boolean(diagAt))

  // ── Lo que ve el usuario: ¿se pintó el subrayado sin guardar? ─────────
  if (canvas) {
    const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' })
    const cyan = await evaluate(ws, COUNT_CYAN(shot.data, canvas))
    console.log(`  píxeles cian del subrayado en el canvas: ${cyan.value}`)
    check('el subrayado se pinta SIN guardar', (cyan.value ?? 0) > 4, String(cyan.value))
  }

  // ── Control: guardar (Ctrl+S) para comparar con el camino lento ────────
  console.log('\n=== 2. control: guardar (Ctrl+S) ===')
  const beforeSaveDiag = await evaluate(ws, `window.__diag.length`, { awaitPromise: false })
  await pressKey(ws, 's', { code: 'KeyS', vk: 83, modifiers: 2 })
  const tSave = await evaluate(ws, `performance.now()`, { awaitPromise: false })
  let saveDiag = null
  for (let i = 0; i < 60; i++) {
    await wait(100)
    const state = await evaluate(
      ws,
      `JSON.stringify(window.__diag.slice(${beforeSaveDiag.value ?? 0}))`,
      { awaitPromise: false }
    )
    const parsed = JSON.parse(state.value ?? '[]')
    const hit = parsed.find((d) => String(d.path).endsWith('style.css'))
    if (hit) {
      saveDiag = hit
      break
    }
  }
  console.log(
    saveDiag
      ? `  tras guardar, diagnóstico a +${Math.round(saveDiag.t - (tSave.value ?? 0))} ms`
      : '  tras guardar, ningún diagnóstico nuevo (el server ya había publicado)'
  )

  // ── Estado del chip de Problemas (lo que ve el usuario) ────────────────
  const chips = await evaluate(
    ws,
    `(() => {
       const title = (sel) => document.querySelector(sel)?.getAttribute('title') ?? null
       return JSON.stringify({ lsp: title('[aria-label=\"Estado de language servers\"]'), problems: title('[aria-label=\"Problemas\"]') })
     })()`,
    { awaitPromise: false }
  )
  console.log(`  chips → ${chips.value}`)

  // ── STREAM completo: ¿aparece y DESAPARECE? ────────────────────────────
  console.log('\n=== 3. todos los eventos de diagnósticos (en orden) ===')
  const all = await evaluate(ws, `JSON.stringify(window.__diag)`, { awaitPromise: false })
  for (const event of JSON.parse(all.value ?? '[]')) {
    console.log(
      `  t=${Math.round(event.t)} · ${String(event.path).split('/').pop()} → ${event.count} · ${JSON.stringify(event.msgs)}`
    )
  }
  const problems = await evaluate(
    ws,
    `(async () => JSON.stringify(await window.api.lsp.readDiagnostics([${JSON.stringify(CSS_FILE)}])))()`
  )
  console.log(`  readDiagnostics → ${problems.value}`)
  try {
    const { readFileSync } = await import('node:fs')
    console.log(`  archivo en disco → ${JSON.stringify(readFileSync(CSS_FILE, 'utf8').slice(0, 120))}`)
  } catch (error) {
    console.log(`  archivo en disco → no se pudo leer: ${error}`)
  }

  // ── 4. UNA SOLA TECLA: ¿el error se marca sin tocar nada más? ───────────
  // El experimento de arriba tipea 18 caracteres; con un desfase de UN cambio
  // no se notaría (el penúltimo estado ya contenía el error). Acá se rompe el
  // CSS con UNA tecla y NO se toca nada más hasta medir: si el subrayado no
  // está, el desfase de un cambio es real y no una impresión.
  console.log('\n=== 4. una sola tecla en un archivo limpio ===')
  await evaluate(
    ws,
    `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(openerId)}, command: 'demo.openFile', args: [${JSON.stringify(ORDER_FILE)}] })`
  )
  await wait(3000)
  const orderBaseline = await evaluate(
    ws,
    `(async () => JSON.stringify(await window.api.lsp.readDiagnostics([${JSON.stringify(ORDER_FILE)}])))()`
  )
  console.log(`  readDiagnostics del archivo limpio → ${orderBaseline.value}`)
  await evaluate(
    ws,
    `(() => { const el = document.querySelector('.scrakk-innerta-canvas'); el?.focus(); return document.activeElement === el })()`,
    { awaitPromise: false }
  )
  // OJO: `Ctrl+End` NO mueve el caret en este motor (se comprobó en la corrida
  // anterior: el texto se insertaba al PRINCIPIO del archivo). Así que la tecla
  // va donde el caret ya está, en (0,0): un solo `{` deja el CSS sin cerrar.
  const tOneKey = await evaluate(ws, `performance.now()`, { awaitPromise: false })
  await pressKey(ws, '{', KEYS['{'])
  let seenServer = null
  for (let i = 0; i < 28; i++) {
    await wait(150)
    const res = await evaluate(
      ws,
      `(async () => JSON.stringify({ t: performance.now(), diags: await window.api.lsp.readDiagnostics([${JSON.stringify(ORDER_FILE)}]) }))()`
    )
    if (!res.ok) {
      console.log(`  (evaluate falló: ${res.error})`)
      break
    }
    const parsed = JSON.parse(res.value ?? '{}')
    const count = (parsed.diags ?? []).reduce((acc, f) => acc + (f.diagnostics?.length ?? 0), 0)
    if (count > 0) {
      seenServer = { t: parsed.t, count }
      break
    }
  }
  console.log(
    seenServer
      ? `  el server publicó ${seenServer.count} problema(s) a +${Math.round(seenServer.t - (tOneKey.value ?? 0))} ms de UNA tecla`
      : '  ✗ el server NO publicó nada en 4,2 s tras UNA tecla'
  )
  check('una tecla produce diagnóstico', Boolean(seenServer))

  const chipsOne = await evaluate(
    ws,
    `(() => {
       const title = (sel) => document.querySelector(sel)?.getAttribute('title') ?? null
       return JSON.stringify({ problems: title('[aria-label=\"Problemas\"]') })
     })()`,
    { awaitPromise: false }
  )
  console.log(`  chips tras la tecla → ${chipsOne.value}`)

  if (canvas) {
    const shotOne = await send(ws, 'Page.captureScreenshot', { format: 'png' })
    const cyanOne = await evaluate(ws, COUNT_CYAN(shotOne.data, canvas))
    console.log(`  píxeles cian tras UNA tecla (sin tocar nada más): ${cyanOne.value}`)
    check('una tecla pinta el subrayado', (cyanOne.value ?? 0) > 0, String(cyanOne.value))

    // ── 5. Ctrl+Z: el caso que reporta el usuario ─────────────────────────
    console.log('\n=== 5. Ctrl+Z (undo de esa misma tecla) ===')
    const beforeUndoDiag = await evaluate(ws, `window.__diag.length`, { awaitPromise: false })
    await pressKey(ws, 'z', { code: 'KeyZ', vk: 90, modifiers: 2 })
    const tUndo = await evaluate(ws, `performance.now()`, { awaitPromise: false })
    await wait(2500)
    const afterUndo = await evaluate(
      ws,
      `JSON.stringify(window.__diag.slice(${beforeUndoDiag.value ?? 0}))`,
      { awaitPromise: false }
    )
    for (const event of JSON.parse(afterUndo.value ?? '[]')) {
      console.log(
        `  diag (después de ctrl+z) +${Math.round(event.t - (tUndo.value ?? 0))}ms · ${event.count} · ${JSON.stringify(event.msgs)}`
      )
    }
    const shotUndo = await send(ws, 'Page.captureScreenshot', { format: 'png' })
    const cyanUndo = await evaluate(ws, COUNT_CYAN(shotUndo.data, canvas))
    console.log(`  píxeles cian después de ctrl+z: ${cyanUndo.value}`)
  }

  // ── 6. Un archivo que YA estaba roto al abrirlo: sin tocar NADA ────────
  // El caso del motor: el módulo WASM tarda ~1 s en cargar y los diagnósticos
  // del server llegan antes. Si el engine empuja los subrayados ANTES de
  // abrir el archivo (cuando todavía no hay path), los descarta y no los
  // vuelve a empujar al abrirlo: el archivo se ve limpio hasta que pasa CUAL
  // otra cosa (otro publish, un guardado, un cambio).
  console.log('\n=== 6. archivo roto EN DISCO, abierto y sin tocar nada ===')
  const shotBefore = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const cyanBefore = await evaluate(ws, COUNT_CYAN(shotBefore.data, canvas))
  await evaluate(
    ws,
    `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(openerId)}, command: 'demo.openFile', args: [${JSON.stringify(BROKEN_FILE)}] })`
  )
  await wait(4500)
  const brokenDiags = await evaluate(
    ws,
    `(async () => JSON.stringify(await window.api.lsp.readDiagnostics([${JSON.stringify(BROKEN_FILE)}])))()`
  )
  console.log(`  el server tiene → ${brokenDiags.value}`)
  const chipsBroken = await evaluate(
    ws,
    `(() => {
       const title = (sel) => document.querySelector(sel)?.getAttribute('title') ?? null
       return title('[aria-label=\"Problemas\"]')
     })()`,
    { awaitPromise: false }
  )
  console.log(`  chip de Problemas → ${chipsBroken.value}`)
  const shotBroken = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const cyanAfter = await evaluate(ws, COUNT_CYAN(shotBroken.data, canvas))
  console.log(`  píxeles cian: antes de abrirlo ${cyanBefore.value} → después ${cyanAfter.value}`)
  check(
    'un archivo que ya estaba roto se subraya al abrirlo',
    (cyanAfter.value ?? 0) > (cyanBefore.value ?? 0) + 4,
    `${cyanBefore.value} → ${cyanAfter.value}`
  )

  // ── 7. CAMBIO DE TAB: el caso determinista del orden ───────────────────
  // Al salir de una tab el engine libera su módulo WASM; al volver hay que
  // recargarlo. Cuando eso pasa, los diagnósticos YA están en la store (no
  // van a volver a llegar), así que si el empuje inicial corre ANTES de que
  // el engine sepa su path, el archivo vuelve sin subrayado y queda así hasta
  // que pase cualquier otra cosa.
  console.log('\n=== 7. salir de la tab y volver (sin tocar nada) ===')
  await evaluate(
    ws,
    `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(openerId)}, command: 'demo.openFile', args: [${JSON.stringify(ORDER_FILE)}] })`
  )
  await wait(3500)
  const shotAway = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const cyanAway = await evaluate(ws, COUNT_CYAN(shotAway.data, canvas))
  await evaluate(
    ws,
    `window.api.extensions.host.executeCommand({ id: ${JSON.stringify(openerId)}, command: 'demo.openFile', args: [${JSON.stringify(BROKEN_FILE)}] })`
  )
  await wait(4000)
  const shotBack = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const cyanBack = await evaluate(ws, COUNT_CYAN(shotBack.data, canvas))
  console.log(`  en la otra tab ${cyanAway.value} ; al VOLVER a la tab rota (sin tocar nada): ${cyanBack.value}`)
  check('al volver a la tab, el subrayado sigue ahí', (cyanBack.value ?? 0) > 4, String(cyanBack.value))

  console.log(`\n${failures === 0 ? 'TOOO OK' : `${failures} fallo(s)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()

/**
 * Probe: ¿el editor pinta igual un `.ts` que un `.js` con el MISMO texto?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * El reporte es concreto: el mismo código (sintaxis JS común, sin nada
 * específico de TS) se ve completo en `x.js` y casi sin color en `x.ts`. Eso no
 * es cosmético: dice que la capa de gramática del motor no está resolviendo
 * TypeScript, y el color que sí aparece viene de OTRA fuente (semantic tokens
 * del LSP), que cubre identificadores y nada más.
 *
 * Medirlo con píxeles y no con intenciones: se abre el mismo contenido con dos
 * nombres, se captura el rect del editor y se cuentan los píxeles con color
 * (`isVivid`: claro y con matiz — el texto sin colorear es gris/blanco).
 *
 *   npm run build
 *   node tools/_probe-ts-language.mjs
 *
 * Deja las capturas en /tmp/innerta-shots/ para MIRARLAS.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng, isVivid } from './lib/png-read.mjs'

const PROFILE = 'release/_probe-tslang'
const PORT = 9339
const SHOTS = '/tmp/innerta-shots'
const BASE = 'tslang-probe'
const TS_FILE = `${BASE}.ts`
const JS_FILE = `${BASE}.js`

// Contenido deliberadamente "JS común": lo mismo que se ve en un `.ts` de una
// config de build. Si el motor resuelve TypeScript, tiene que pintar TODO esto
// igual que en `.js`; no se le pide nada que sólo TS tenga.
const SAMPLE = [
  '/**',
  ' * Config de build del editor: comentario de bloque para ver el color de comentario.',
  ' */',
  "import { resolve } from 'node:path'",
  "import { readFileSync } from 'node:fs'",
  '',
  "const APP_VERSION = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')).version",
  "export const baseConfig = { name: 'scrakk', version: APP_VERSION, retries: 3, strict: true }",
  '',
  'function aliasFor(root, scope) {',
  "  return { '@core': resolve(root, scope), '@ui': resolve(root, scope + '/ui') }",
  '}',
  '',
  'export function build(entries) {',
  '  const first = entries[0] ?? null',
  '  const label = `entry: ${first} (${entries.length})`',
  '  return entries.map((entry) => aliasFor(entry, label))',
  '}',
  '',
  '// comentario de línea: operadores, números y delimitadores',
  'const total = (1 + 2) * 3 - 4 / 2 >= 1 && true',
  'const pattern = /^[a-z]+$/',
  ''
].join('\n')

let ws = null
let mainContextId = null
const pending = new Map()
let nextId = 1
const logs = []
let failures = 0

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

function send(ws, method, params) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve) => {
    pending.set(id, resolve)
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        resolve({ __timeout: true })
      }
    }, 30000)
  })
}

async function evaluate(expression, { awaitPromise = true } = {}) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    ...(mainContextId === null ? {} : { contextId: mainContextId })
  })
  if (result?.exceptionDetails) {
    return { ok: false, error: result.exceptionDetails.text ?? 'excepción' }
  }
  const value = result?.result
  if (value?.type === 'undefined') return { ok: true, value: undefined }
  return { ok: true, value: value?.value }
}

async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const list = await res.json()
  return list.find((t) => t.type === 'page' && t.url.includes('index.html')) ?? list[0]
}

/** Captura el rect del canvas del editor con la FEATURE de la app. */
async function captureEditor(name) {
  const res = await evaluate(
    `(() => {
       const canvas = document.querySelector('.scrakk-innerta-canvas')
       const rect = canvas
         ? (() => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()
         : undefined
       return window.api.screenshot.capture(Object.assign(${JSON.stringify({ dir: SHOTS, name })}, { rect }))
     })()`
  )
  const value = res.value
  if (value?.success) console.log(`  captura → ${value.path} (${value.width}×${value.height})`)
  return value
}

function readShot(shot) {
  if (!shot?.path) return null
  try {
    return decodePng(readFileSync(shot.path))
  } catch {
    return null
  }
}

/** Color y "densidad de texto" de una captura del editor. */
function measure(image) {
  if (!image) return null
  let vivid = 0
  let ink = 0
  const hues = new Set()
  for (let i = 0; i < image.width * image.height * 4; i += 4) {
    const r = image.data[i]
    const g = image.data[i + 1]
    const b = image.data[i + 2]
    // "Tinta" = cualquier cosa que no sea el fondo del editor (16,16,16) ni el
    // wallpaper que se ve por transparencia (grises planos).
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (!(r === 16 && g === 16 && b === 16) && max - min > 12) ink++
    if (isVivid(r, g, b)) {
      vivid++
      hues.add(`${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`)
    }
  }
  return { vivid, ink, hues: hues.size }
}

async function pressKey(key, code, vk, modifiers = 0) {
  await send(ws, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    modifiers
  })
}

/** Corre un comando por la PALETA (Ctrl+Shift+P), como lo haría el usuario. */
async function runPaletteCommand(query, matcher) {
  await pressKey('P', 'KeyP', 80, 10)
  await wait(1500)
  await evaluate(
    `(() => {
       const input = document.querySelector('input[role="combobox"], [data-command-palette] input, input')
       if (!input) return false
       const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
       setter.call(input, ${JSON.stringify(query)})
       input.dispatchEvent(new Event('input', { bubbles: true }))
       return true
     })()`,
    { awaitPromise: false }
  )
  await wait(1200)
  const ran = await evaluate(
    `(() => {
       const items = [...document.querySelectorAll('*')]
         .filter((el) => el.children.length === 0 && ${matcher}.test(el.textContent ?? ''))
       const item = items[items.length - 1]
       if (!item) return false
       ;(item.closest('[role="option"], li, button, div') ?? item).click()
       return true
     })()`,
    { awaitPromise: false }
  )
  return ran.value === true
}

async function openFromExplorer(name) {
  const opened = await evaluate(
    `(async () => {
       const findRow = () => [...document.querySelectorAll('*')].filter(
         (el) => el.children.length === 0 && el.textContent?.trim() === ${JSON.stringify(name)}
       )[0]
       for (let i = 0; i < 40 && !findRow(); i++) await new Promise((r) => setTimeout(r, 500))
       const row = findRow()
       if (!row) return { clicked: false }
       ;(row.closest('[role="button"], [class*="row"], li, div') ?? row).click()
       return { clicked: true }
     })()`
  )
  if (opened.value?.clicked !== true) {
    const dump = await evaluate(
      `JSON.stringify({
         rutas: [...document.querySelectorAll('[class*="explorer" i], [class*="tree" i]')].slice(0, 5).map((el) => el.className),
         hojas: [...document.querySelectorAll('*')]
           .filter((el) => el.children.length === 0 && el.textContent?.trim())
           .map((el) => el.textContent.trim())
           .filter((t) => t.length < 30)
           .slice(0, 40)
       })`,
      { awaitPromise: false }
    )
    console.log('  DOM (no encontré la fila):', dump.value)
  }
  return opened.value?.clicked === true
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true })
  mkdirSync(PROFILE, { recursive: true })
  mkdirSync(SHOTS, { recursive: true })
  for (const file of [TS_FILE, JS_FILE]) {
    writeFileSync(join(process.cwd(), file), SAMPLE)
  }

  const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
  if (!existsSync(electron)) throw new Error(`no encuentro electron en ${electron}`)
  const child = spawn(
    electron,
    ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'],
    { cwd: process.cwd(), stdio: 'ignore', detached: false }
  )
  process.on('exit', () => child.kill())

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
      logs.push(text)
      // El motor habla por stderr (printErr de emscripten) y el puente por
      // console.debug: las dos cosas que explican "por qué no hay color".
      if (/SyntaxHighlighter|TreeSitter|tree-sitter|\[languages\]|grammar/i.test(text)) {
        console.log(`[renderer:${msg.params.type}] ${text}`)
      }
    }
  })
  void send(ws, 'Runtime.enable', {})

  for (let i = 0; i < 40; i++) {
    const ready = await evaluate(
      `document.readyState === 'complete' && !!window.api?.screenshot`,
      { awaitPromise: false }
    )
    if (ready.value === true) break
    await wait(1000)
  }

  // Perfil limpio: onboarding afuera y la raíz del explorador en cwd (ahí viven
  // los dos archivos de prueba).
  await evaluate(
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       localStorage.setItem('scrakk-studio:root-path', ${JSON.stringify(process.cwd())})
       return true
     })()`,
    { awaitPromise: false }
  )
  await evaluate(`window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(5000)
  await wait(8000)

  // El layout arranca con el slot izquierdo cerrado: se abre el explorador por
  // la paleta (el MISMO comando del registry que corre el usuario).
  await runPaletteCommand('explorador', '/explorador/i')
  await wait(3000)

  const results = {}
  for (const [kind, file] of [
    ['js', JS_FILE],
    ['ts', TS_FILE]
  ]) {
    console.log(`\n=== abrir ${file} (${kind.toUpperCase()}) ===`)
    const opened = await openFromExplorer(file)
    check(`el archivo ${file} se abre desde el explorador`, opened)
    await wait(9000)
    const shot = await captureEditor(`tslang-${kind}`)
    const image = readShot(shot)
    const data = measure(image)
    results[kind] = data
    console.log(
      `  ${kind}: píxeles con color ${data?.vivid ?? '?'} · tinta ${data?.ink ?? '?'} · matices distintos ${data?.hues ?? '?'}`
    )
  }

  console.log('\n=== veredicto ===')
  const js = results.js
  const ts = results.ts
  check(
    'los dos archivos tienen el mismo texto en pantalla (tinta comparable)',
    js && ts && ts.ink > js.ink * 0.6,
    `js ${js?.ink} vs ts ${ts?.ink}`
  )
  check(
    'el .js se pinta con color (la referencia)',
    (js?.vivid ?? 0) > 500,
    `${js?.vivid ?? 0} píxeles con color`
  )
  check(
    'el .ts se pinta IGUAL que el .js (mismo texto, misma sintaxis)',
    js && ts && ts.vivid > js.vivid * 0.75,
    `ts ${ts?.vivid ?? 0} vs js ${js?.vivid ?? 0} (${Math.round(((ts?.vivid ?? 0) / (js?.vivid || 1)) * 100)}%)`
  )

  const engineLogs = logs.filter((l) => /SyntaxHighlighter|TreeSitter/.test(l))
  if (engineLogs.length > 0) {
    console.log('\nmensajes del motor:')
    for (const line of [...new Set(engineLogs)]) console.log(`  ${line}`)
  }

  console.log('\ncapturas para mirar:')
  console.log(`  ${SHOTS}/tslang-js.png  ${SHOTS}/tslang-ts.png`)
  console.log(failures === 0 ? '\nTODO OK' : `\n${failures} CHECKS FALLARON`)
  child.kill()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

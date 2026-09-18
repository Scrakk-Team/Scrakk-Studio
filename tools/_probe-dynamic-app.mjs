/**
 * Probe: TREE-SITTER DINÁMICO end-to-end en la app compilada.
 *
 * Qué verifica (sobre Electron real, perfil limpio, `.wasm` REAL del paquete):
 *  1. El `.sef` de lenguaje se instala y el lenguaje queda registrado.
 *  2. `window.api.extensions.tokenizeDynamic` responde con tokens y scopes:
 *     es la prueba de que el `utilityProcess` se levanta, recibe el pedido y
 *     contesta por `parentPort` — lo que ningún test de unidades cubre.
 *  3. El paquete se RECHAZA si el sha256 no coincide (no se ejecuta el wasm).
 *  4. Abrir el archivo en el editor pinta tokens CON COLOR en el canvas.
 *
 * Uso:
 *   npm run build
 *   node tools/_make-dynamic-sef.mjs <tree-sitter-javascript.wasm>
 *   node tools/_probe-dynamic-app.mjs
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng, diffNeutralToVivid, diffStrong } from './lib/png-read.mjs'


const PROFILE = 'release/_probe-dynamic'
const PORT = 9338
const SEF = process.argv[2] ?? '/tmp/scrakk-dynamic-lang.sef'
const SAMPLE_NAME = 'probe-dynamic-sample.dynjs'
const SAMPLE = join(process.cwd(), SAMPLE_NAME)
const EXTENSION_ID = 'probe.dynamiclang'

if (!existsSync(SEF)) {
  console.error(`no encuentro el .sef: ${SEF} (corré tools/_make-dynamic-sef.mjs)`)
  process.exit(1)
}

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })
writeFileSync(
  SAMPLE,
  [
    '// comentario para ver el color de comentario',
    'const mensaje = "hola desde el parser dinamico"',
    'const numero = 42',
    'const estilo = `',
    'a { color: red }',
    '`',
    '',
    'function saludar(nombre) {',
    '  return nombre',
    '}',
    'saludar(mensaje)',
    ''
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
const mainLogs = []
child.stdout.on('data', (chunk) => {
  const text = String(chunk)
  mainLogs.push(text)
  if (text.includes('tree-sitter') || text.includes('[languages]')) process.stdout.write(`[main] ${text}`)
})
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
const SHOTS = '/tmp/innerta-shots'

/** Texto legible de un resultado JSON para los mensajes de check. */
function noticedText(raw) {
  return String(raw ?? '').slice(0, 200)
}

/**
 * Pide la captura del EDITOR usando la feature real de la app
 * (`window.api.screenshot`): así el probe verifica el mismo camino que usa el
 * usuario y deja un PNG para MIRAR (no sólo contar píxeles).
 */
async function captureEditor(name) {
  const res = await evaluate(
    currentWs,
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
  else console.log(`  captura falló → ${value?.error ?? res.error}`)
  return value
}

/**
 * Píxeles brillantes y con matiz del screenshot actual (color de token).
 *
 * Se recorta al RECT del canvas de Innerta: si se mira la pantalla entera, el
 * panel de chat cambia entre capturas y su color de acento se cuenta como si
 * fuera un token. Recortado al editor, el delta es del archivo y nada más.
 *
 * El canvas es WebGL, así que sus píxeles no se pueden leer desde el renderer
 * (`getContext('2d')` → null): de ahí la vuelta por el screenshot.
 */
/** Lee un PNG capturado, o `null` si no existe. */
function readShot(shot) {
  if (!shot?.path) return null
  try {
    return decodePng(readFileSync(shot.path))
  } catch (error) {
    console.log('  no pude leer la captura:', error.message)
    return null
  }
}

let currentWs = null
/**
 * Líneas de consola del renderer (todas: el filtro es para MOSTRAR).
 *
 * Se guardan porque el puente del árbol publica una línea por pasada con lo que
 * hizo (tokens, símbolos, folds y si el MOTOR los aceptó): es la única evidencia
 * de que el plegado del árbol llegó al engine, que no se puede leer desde el DOM.
 */
const rendererLogs = []
const findLog = (regex) => rendererLogs.find((line) => regex.test(line)) ?? null
let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

/** Tecla real por CDP (la paleta escucha el canvas/la ventana, no un input). */
async function pressKey(key, code, vk, modifiers = 0) {
  await send(currentWs, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    modifiers
  })
}

/** Rect del canvas del editor en coordenadas de PÁGINA (donde clickea el mouse). */
async function canvasRect() {
  const res = await evaluate(
    currentWs,
    `(() => {
       const c = document.querySelector('.scrakk-innerta-canvas')
       if (!c) return null
       const r = c.getBoundingClientRect()
       return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
     })()`,
    { awaitPromise: false }
  )
  return res.value
}

/**
 * Click REAL (mouse + pointer) en coordenadas de página.
 *
 * El canvas escucha `pointerdown`, que Chrome sintetiza a partir del mouse: es
 * lo más parecido a la mano del usuario que se puede hacer por CDP, y pasa por
 * el MISMO camino que un click humano (hit-test del engine incluido).
 */
async function clickAt(x, y) {
  const point = {
    x: Math.round(x),
    y: Math.round(y),
    button: 'left',
    clickCount: 1,
    pointerType: 'mouse'
  }
  await send(currentWs, 'Input.dispatchMouseEvent', {
    ...point,
    type: 'mouseMoved',
    button: 'none',
    clickCount: 0
  })
  await wait(80)
  await send(currentWs, 'Input.dispatchMouseEvent', { ...point, type: 'mousePressed' })
  await send(currentWs, 'Input.dispatchMouseEvent', { ...point, type: 'mouseReleased' })
}

/**
 * Posición del cursor según la STATUSBAR.
 *
 * Es la verdad del usuario y no un internal del engine: si el motor mueve el
 * cursor sin que la statusbar lo refleje, el feature NO funciona aunque el store
 * diga que sí.
 */
async function readStatusCursor() {
  const res = await evaluate(
    currentWs,
    `(() => {
       const el = document.querySelector('[aria-label="Posición del cursor en el editor"]')
       return el ? (el.textContent ?? '') : null
     })()`,
    { awaitPromise: false }
  )
  const raw = typeof res.value === 'string' ? res.value : ''
  const match = raw.match(/Ln\s*(\d+)\s*,\s*Col\s*(\d+)/)
  if (!match) return null
  return { line: Number(match[1]) - 1, col: Number(match[2]) - 1, raw }
}

/**
 * Corre un comando por la PALETA (Ctrl+Shift+P), como lo haría el usuario: es
 * la forma de probar un comando registrado sin conocer su implementación.
 */
async function runPaletteCommand(query, matcher) {
  await pressKey('P', 'KeyP', 80, 10)
  await wait(1500)
  await evaluate(
    currentWs,
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
    currentWs,
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

const waitForBridge = async (ws) => {
  for (let i = 0; i < 60; i++) {
    const ready = await evaluate(
      ws,
      `document.readyState === 'complete' && !!window.api?.extensions?.tokenizeDynamic`,
      { awaitPromise: false }
    )
    if (ready.value === true) return true
    await wait(1000)
  }
  return false
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
  currentWs = ws

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
      rendererLogs.push(text)
      if (process.env['PROBE_DEBUG'] === '1') console.log(`[renderer:${msg.params.type}] ${text}`)
      else if (/languages|tree-sitter|treeSitter/.test(text)) {
        console.log(`[renderer:${msg.params.type}] ${text}`)
      }
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})

  await wait(2500)
  // Perfil limpio: onboarding afuera y la raíz del explorador en cwd (el
  // archivo de prueba vive ahí).
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
  await wait(4000)
  check('el puente nativo está listo', await waitForBridge(ws))

  // ── 1. Instalar el `.sef` de lenguaje dinámico ───────────────────────────
  console.log('\n=== 1. installSef(package con parser tree-sitter) ===')
  const installed = await evaluate(ws, `window.api.extensions.installSef(${JSON.stringify(SEF)})`)
  const info = installed.value
  console.log('install →', JSON.stringify(info)?.slice(0, 400))
  check('el .sef se instala', installed.ok && info?.success === true, info?.error)
  if (!info?.success) return
  const dir = info.extension?.dir
  check('la extensión tiene directorio de paquete', typeof dir === 'string', dir)

  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(4000)
  check('la app vuelve a arrancar con el lenguaje registrado', await waitForBridge(ws))

  // ── 2. El worker en proceso aparte, por IPC ──────────────────────────────
  console.log('\n=== 2. tokenizeDynamic (utilityProcess + parser wasm real) ===')
  const parserPath = `${dir}/grammars/dynjs.wasm`
  const queryPath = `${dir}/queries/highlights.scm`
  const code = [
    '// comentario',
    'const saludo = "hola"',
    'function f(n) { return 42 }'
  ].join('\n')
  const started = Date.now()
  const dynamic = await evaluate(
    ws,
    `window.api.extensions.tokenizeDynamic(${JSON.stringify({
      languageId: 'dynjs',
      parserPath,
      queries: [{ file: queryPath, category: 'highlights' }],
      text: code
    })})`
  )
  const result = dynamic.value
  const elapsed = Date.now() - started
  check('el tokenizado dinámico responde', dynamic.ok && result?.ok === true, result?.error)
  check('devolvió tokens', (result?.tokens?.length ?? 0) > 0, `${result?.tokens?.length ?? 0} tokens en ${elapsed} ms`)
  const scopes = [...new Set((result?.scopeSets ?? []).flat())]
  console.log('  scopes distintos:', scopes.join(', '))
  check('la query se aplicó', (result?.applied?.length ?? 0) === 1, JSON.stringify(result?.applied))
  check('no hubo queries rotas', (result?.failed?.length ?? 0) === 0, JSON.stringify(result?.failed))
  for (const expected of ['keyword', 'variable', 'string', 'number', 'comment', 'function']) {
    check(`hay scope ${expected}`, scopes.includes(expected))
  }

  // Un segundo pedido seguido: el worker tiene que REUSARSE (no levantar otro
  // proceso por tokenizado).
  const again = await evaluate(
    ws,
    `window.api.extensions.tokenizeDynamic(${JSON.stringify({
      languageId: 'dynjs',
      parserPath,
      queries: [{ file: queryPath, category: 'highlights' }],
      text: code
    })})`
  )
  check('el segundo pedido también responde (worker reusable)', again.value?.ok === true, again.value?.error)

  // ── 2b. El árbol entrega TODO, no sólo color ────────────────────────────
  // Se piden las SEIS categorías en un solo pedido (como hace el puente real)
  // y se verifica que los datos salgan: símbolos (outline), plegado, alcances
  // (ir a la definición), objetos de texto y una inyección de otro lenguaje.
  console.log('\n=== 2b. datos del árbol (tags/folds/locals/textobjects/injections) ===')
  const codeWithStructure = [
    'const base = 1',
    'function suma(a) {',
    '  const total = a',
    '  return total',
    '}',
    'suma(base)',
    'const lista = [1, 2, 3]',
    'const plantilla = `',
    'p { color: blue }',
    '`'
  ].join('\n')
  const categories = [
    ['highlights', 'highlights.scm'],
    ['tags', 'tags.scm'],
    ['folds', 'folds.scm'],
    ['locals', 'locals.scm'],
    ['textobjects', 'textobjects.scm'],
    ['injections', 'injections.scm']
  ].map(([category, file]) => ({ file: `${dir}/queries/${file}`, category }))
  const rich = await evaluate(
    ws,
    `window.api.extensions.tokenizeDynamic(${JSON.stringify({
      languageId: 'dynjs',
      parserPath,
      queries: categories,
      text: codeWithStructure
    })})`
  )
  const richResult = rich.value
  check('el pedido con todas las categorías responde', rich.ok && richResult?.ok === true, richResult?.error)
  check('no hubo queries rotas', (richResult?.failed?.length ?? 0) === 0, JSON.stringify(richResult?.failed))
  const data = richResult?.data ?? {}
  console.log(
    '  datos → símbolos:', JSON.stringify((data.symbols ?? []).map((s) => `${s.name}:${s.kind}`)),
    '· folds:', JSON.stringify(data.folds),
    '· locales:', (data.locals ?? []).length,
    '· textobjects:', (data.textObjects ?? []).length,
    '· inyecciones:', JSON.stringify(data.injections)
  )
  check(
    'salieron los SÍMBOLOS del árbol (outline sin LSP)',
    (data.symbols ?? []).some((symbol) => symbol.name === 'suma'),
    JSON.stringify((data.symbols ?? []).map((s) => s.name))
  )
  check(
    'la función se anida con su `total` adentro',
    (data.symbols ?? []).some((symbol) =>
      (symbol.children ?? []).some((child) => child.name === 'total')
    )
  )
  check('salieron los rangos de PLEGADO', (data.folds ?? []).length > 0, JSON.stringify(data.folds))
  check(
    'salieron las DEFINICIONES y REFERENCIAS (ir a la definición)',
    (data.locals ?? []).some((entry) => entry.kind === 'definition' && entry.name === 'suma') &&
      (data.locals ?? []).some((entry) => entry.kind === 'reference' && entry.name === 'suma'),
    `${(data.locals ?? []).length} entradas: ` +
      JSON.stringify((data.locals ?? []).map((entry) => `${entry.kind[0]}:${entry.name}@${entry.line}`))
  )
  check(
    'la definición de `total` sabe su ÁMBITO (la función)',
    (data.locals ?? []).some(
      (entry) => entry.name === 'total' && entry.kind === 'definition' && entry.scope?.startLine === 1
    )
  )
  check('salieron los OBJETOS de texto', (data.textObjects ?? []).length > 0, JSON.stringify((data.textObjects ?? []).map((o) => o.name)))
  check(
    'se detectó la INYECCIÓN de otro lenguaje',
    (data.injections ?? []).some((injection) => injection.language === 'css'),
    JSON.stringify(data.injections)
  )
  check(
    'las categorías aplicadas se reportan',
    ['highlights', 'tags', 'folds', 'locals', 'textobjects', 'injections'].every((category) =>
      (data.appliedCategories ?? []).includes(category)
    ),
    JSON.stringify(data.appliedCategories)
  )

  // ── 3. sha256 que no coincide: el wasm NO se ejecuta ─────────────────────
  console.log('\n=== 3. sha256 declarado y distinto ===')
  const rejected = await evaluate(
    ws,
    `window.api.extensions.tokenizeDynamic(${JSON.stringify({
      languageId: 'dynjs',
      parserPath,
      sha256: 'deadbeef',
      queries: [{ file: queryPath, category: 'highlights' }],
      text: code
    })})`
  )
  check(
    'se rechaza por hash',
    rejected.value?.ok === false && /sha256/.test(rejected.value?.error ?? ''),
    rejected.value?.error
  )

  // ── 4. Abrir el archivo: el puente publica y el canvas PINTA ─────────────
  console.log('\n=== 4. abrir el archivo en el editor ===')
  // El layout arranca con el slot izquierdo cerrado: se abre el explorador por
  // la paleta (el MISMO comando del registry que corre el usuario).
  check(
    'la paleta ejecuta el comando del explorador',
    await runPaletteCommand('explorador', '/explorador/i')
  )
  await wait(3000)

  // El archivo se abre desde el explorador (misma ruta que usa el usuario).
  const opened = await evaluate(
    ws,
    `(async () => {
       const findRow = () => [...document.querySelectorAll('*')].filter(
         (el) => el.children.length === 0 && el.textContent?.trim() === ${JSON.stringify(SAMPLE_NAME)}
       )[0]
       for (let i = 0; i < 40 && !findRow(); i++) await new Promise((r) => setTimeout(r, 500))
       const row = findRow()
       if (!row) return { clicked: false }
       const target = row.closest('[role="button"], [class*="row"], li, div') ?? row
       target.click()
       return { clicked: true }
     })()`
  )
  check('el archivo se puede clickear en el explorador', opened.value?.clicked === true, JSON.stringify(opened.value))
  await wait(7000)

  if (process.env['PROBE_DEBUG'] === '1') {
    const dump = await evaluate(
      ws,
      `JSON.stringify({
         tabs: [...document.querySelectorAll('[class*="tab" i]')].map((el) => el.textContent?.trim().slice(0, 40)).filter(Boolean).slice(0, 10),
         leaves: [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.trim()).map((el) => el.textContent.trim()).filter((t) => t.length < 50).slice(0, 80)
       })`,
      { awaitPromise: false }
    )
    console.log('  debug DOM:', dump.value)
  }

  const editor = await evaluate(
    ws,
    `(() => {
       const canvas = document.querySelector('.scrakk-innerta-canvas')
       return { canvas: !!canvas, width: canvas?.width ?? 0, height: canvas?.height ?? 0 }
     })()`,
    { awaitPromise: false }
  )
  check('el editor montó el archivo', editor.value?.canvas === true, JSON.stringify(editor.value))

  // Captura del rect del editor usando la FEATURE de la app (window.api.screenshot):
  // el canvas es WebGL y sus píxeles no se pueden leer desde el renderer.
  const shotWithExt = await captureEditor('editor-con-extension')

  // ── 4b. El árbol llegó al editor: símbolos, plegado (motor) y alcances ──
  console.log('\n=== 4b. el árbol en el editor (log del puente) ===')
  const summary = findLog(/\[languages\] dynjs:/)
  if (!summary) console.log('  (no apareció la línea del puente; logs con [languages]:', rendererLogs.filter((l) => l.includes('[languages]')).length, ')')
  else console.log(`  ${summary}`)
  const parsed = summary?.match(
    /(\d+) tokens · (\d+) símbolos · folds: (.+?) \((aplicados|NO aplicados)\) · (\d+) locales · (\d+) textobjects · (\d+) inyecciones/
  )
  check('el puente del árbol corrió para el archivo', Boolean(parsed), noticedText(summary))
  if (parsed) {
    const [, tokens, symbols, foldsDetail, foldsApplied, locals, textObjects, injections] = parsed
    check('pintó tokens', Number(tokens) > 0, `${tokens} tokens`)
    check('publicó SÍMBOLOS para el outline', Number(symbols) > 0, `${symbols} símbolos`)
    // Este dato lo da el CONTADOR DEL MOTOR (`GetInnertaFoldingCount`), no el
    // host: verifica que los rangos estén adentro del engine y que sean los
    // del host (no los de la heurística de indentación).
    check(
      'el MOTOR tiene los folds del árbol (su propio contador)',
      /^\d+ en el motor, del host$/.test(foldsDetail),
      foldsDetail
    )
    check('los rangos quedaron aplicados', foldsApplied === 'aplicados', foldsApplied)
    check('publicó ALCANCES (ir a la definición)', Number(locals) > 0, `${locals} locales`)
    check('publicó OBJETOS de texto', Number(textObjects) > 0, `${textObjects} textobjects`)
    check('reportó la INYECCIÓN del template string', Number(injections) > 0, `${injections} inyecciones`)
  }

  // El panel Outline consume los SÍMBOLOS del árbol (no el extractor por regex:
  // `dynjs` no es un lenguaje que ese extractor conozca). Se abre como lo hace
  // el usuario: el botón del ToolDock (`data-button-id="outline"`).
  const openedOutline = await evaluate(
    ws,
    `(async () => {
       const find = () => document.querySelector('[data-button-id="outline"]')
       for (let i = 0; i < 40 && !find(); i++) await new Promise((r) => setTimeout(r, 500))
       const button = find()
       if (!button) return false
       button.click()
       return true
     })()`
  )
  check('el panel Esquema se abre', openedOutline.value === true, JSON.stringify(openedOutline.value))
  await wait(2500)
  const outline = await evaluate(
    ws,
    `JSON.stringify({
       suma: [...document.querySelectorAll('*')].some((el) => el.children.length === 0 && el.textContent?.trim() === 'saludar'),
       fuente: [...document.querySelectorAll('*')].some(
         (el) => el.children.length === 0 && /tags\.scm/i.test(el.textContent ?? '')
       )
     })`,
    { awaitPromise: false }
  )
  const outlineState = JSON.parse(outline.value ?? '{}')
  check('el outline muestra el símbolo del ÁRBOL', outlineState.suma === true, noticedText(outline.value))
  check('el outline dice de dónde salieron', outlineState.fuente === true, noticedText(outline.value))
  await captureEditor('outline-con-simbolos')

  // ── 4c. El ajuste de MOTOR de gramática (Ajustes → Resaltado) ────────────
  // Se elige `textMate` como haría la UI: guarda la preferencia y dispara el
  // evento con el que los puentes recalculan el archivo abierto. El lenguaje
  // `dynjs` no tiene `.tmLanguage`, así que el árbol tiene que APAGARSE (y
  // decirlo): es la prueba de que la opción pesa sobre el desempate.
  console.log('\n=== 4c. ajuste del motor de gramática ===')
  const beforeSwitch = rendererLogs.length
  /**
   * Se escribe la preferencia EXACTAMENTE como la escribe la UI.
   *
   * `lsSet` (el motor de storage) hace `JSON.stringify` de lo que recibe, y
   * `persistGrammarEngine` ya le pasa un string JSON: el valor guardado queda
   * doblemente codificado (`"\"textMate\""`) y el getter lo decodifica dos
   * veces. Escribirlo una sola vez guardaría un valor que el getter rechaza y
   * caería al default (auto), y el probe estaría probando otra cosa.
   */
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:editor.grammarEngine', ${JSON.stringify(JSON.stringify(JSON.stringify('textMate')))})
       window.dispatchEvent(new CustomEvent('highlight-engine-changed', { detail: { engine: 'textMate' } }))
       return true
     })()`,
    { awaitPromise: false }
  )
  await wait(3000)
  const switched = rendererLogs
    .slice(beforeSwitch)
    .find((line) => /el motor elegido es TextMate/.test(line))
  check('con el motor en TextMate el árbol se apaga y lo dice', Boolean(switched), noticedText(switched))
  // El motivo nombra la consecuencia real (este lenguaje no trae `.tmLanguage`),
  // y no un "sin gramática usable" que haría buscar el problema donde no está.
  check(
    'el motivo dice que el elegido no tiene .tmLanguage',
    /no trae \.tmLanguage/.test(switched ?? ''),
    noticedText(switched)
  )
  await captureEditor('editor-motor-textmate')

  // Y al volver a `treeSitter`, el árbol tiene que correr DE NUEVO sobre el
  // mismo archivo (sin reabrir nada).
  const beforeRestore = rendererLogs.length
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:editor.grammarEngine', ${JSON.stringify(JSON.stringify(JSON.stringify('treeSitter')))})
       window.dispatchEvent(new CustomEvent('highlight-engine-changed', { detail: { engine: 'treeSitter' } }))
       return true
     })()`,
    { awaitPromise: false }
  )
  await wait(3000)
  const restored = rendererLogs
    .slice(beforeRestore)
    .find((line) => /\[languages\] dynjs:/.test(line))
  check('al volver a tree-sitter el árbol corre de nuevo sin reabrir', Boolean(restored), noticedText(restored))
  await evaluate(
    ws,
    `localStorage.setItem('scrakk:editor.grammarEngine', ${JSON.stringify(JSON.stringify(JSON.stringify('auto')))})`,
    { awaitPromise: false }
  )

  // ── 4d. El árbol USÁNDOSE: F12, expandir selección y plegado ─────────────
  //
  // Que el store tenga los datos NO prueba que el usuario pueda usarlos. Acá se
  // maneja la app como una persona: se clickea el texto, se aprieta F12, se
  // expande la selección y se toca el chevron del gutter. La verdad de cada
  // paso sale de la STATUSBAR (lo que ve el usuario) y de la captura.
  console.log('\n=== 4d. navegación y plegado sobre el editor real ===')
  const geo = await canvasRect()
  check('hay canvas del editor para interactuar', Boolean(geo), JSON.stringify(geo))

  // ── Calibración de la geometría del editor ───────────────────────────────
  //
  // El probe necesita clickear LÍNEAS y COLUMNAS, no píxeles al azar, y eso
  // exige saber dónde empieza el texto y cuánto mide un carácter. Nada de eso se
  // asume: se clickea y se lee la statusbar, y el modelo que se deduce se
  // VERIFICA contra todas las muestras.
  //
  // Con DOS puntos no alcanza: el redondeo del `floor` de la línea hace que
  // 86px/5 líneas dé 17.2 cuando el real es 16, y entonces el click cae una
  // línea al lado. Por eso el barrido y la verificación de residuos.
  // Estima inicial grosera: 86px entre el primer click y el de la línea 6 de la
  // calibración previa. Se corrige sola abajo; lo que importa es que `aim` tenga
  // de dónde partir.
  let lineHeight = 17.2
  let top = 12

  /**
   * Clickea hasta CAER en `line` (0-based) y devuelve una y verificada.
   *
   * El correcci\u00f3n sale del propio editor: si el click cayó en otra línea, la
   * diferencia dice cuánto mover el origen. Así no hace falta un modelo exacto
   * de entrada y el resultado queda PROBADO, no estimado.
   */
  const aim = async (line, tries = 5) => {
    for (let attempt = 0; attempt < tries; attempt++) {
      const y = top + (line + 0.5) * lineHeight
      await clickAt(geo.x + 300, geo.y + y)
      await wait(280)
      const cursor = await readStatusCursor()
      if (cursor?.line === line) return { y, attempts: attempt + 1 }
      if (cursor) top += (line - cursor.line) * lineHeight
    }
    return null
  }

  const anchor = await aim(1)
  const far = await aim(10)
  if (anchor && far) {
    lineHeight = (far.y - anchor.y) / 9
    top = anchor.y - 1.5 * lineHeight
  }
  const verified = []
  for (const line of [3, 6, 8]) {
    verified.push((await aim(line)) ? `Ln${line + 1}✓` : `Ln${line + 1}✗`)
  }
  check(
    'la geometría vertical del editor se ajusta y se verifica',
    Boolean(anchor && far) && verified.every((v) => v.endsWith('✓')),
    `alto de línea ${lineHeight.toFixed(2)}px · línea 1 en y=${anchor?.y?.toFixed(1) ?? '?'} (${anchor?.attempts ?? '?'} intentos) · verificación ${verified.join(' ')}`
  )

  // Barrido horizontal sobre la línea 1 (`const mensaje = "…"`, la más larga)
  // hasta que la columna deje de crecer: ahí está el final de la línea o un
  // click que cayó en el gutter. El ajuste se verifica contra cada muestra.
  const samples = []
  let previousCol = -1
  const line1Y = geo.y + (anchor?.y ?? top + 1.5 * lineHeight)
  for (let local = 65; local <= geo.width - 140; local += 25) {
    await clickAt(geo.x + local, line1Y)
    await wait(260)
    const cursor = await readStatusCursor()
    if (!cursor || cursor.line !== 1) continue
    if (cursor.col <= previousCol) break // dejó de crecer: saturado
    previousCol = cursor.col
    samples.push({ local, col: cursor.col })
  }

  /** Ajuste por cuadrados mínimos de col = (x - origen) / ancho. */
  const fit = (() => {
    if (samples.length < 2) return null
    const n = samples.length
    const sumX = samples.reduce((acc, s) => acc + s.local, 0)
    const sumC = samples.reduce((acc, s) => acc + s.col, 0)
    const sumXC = samples.reduce((acc, s) => acc + s.local * s.col, 0)
    const sumCC = samples.reduce((acc, s) => acc + s.col * s.col, 0)
    const den = n * sumCC - sumC * sumC
    if (den === 0) return null
    const charWidth = (n * sumXC - sumX * sumC) / den
    const origin = (sumX - charWidth * sumC) / n
    return { charWidth, origin }
  })()
  const charWidth = fit?.charWidth ?? 0
  const textOrigin = fit?.origin ?? 0
  const maxError = fit
    ? Math.max(
        ...samples.map((s) => Math.abs(Math.round((s.local - fit.origin) / fit.charWidth) - s.col))
      )
    : 99
  check(
    'el mapeo x → columna del editor se ajusta y se verifica',
    Boolean(fit) && samples.length >= 4 && charWidth > 4 && charWidth < 20 && maxError <= 1,
    `${samples.map((s) => `${s.local}→C${s.col + 1}`).join(' ')} · carácter ${charWidth.toFixed(2)}px · texto desde x=${textOrigin.toFixed(1)} · error máx ${maxError} col`
  )

  /** Click en la columna 0 de una línea, con la línea VERIFICADA por `aim`. */
  const clickLine = async (line) => {
    const hit = await aim(line)
    if (!hit) return null
    await clickAt(geo.x + textOrigin + 3, geo.y + hit.y)
    await wait(350)
    return await readStatusCursor()
  }

  // 1) F12 sobre una REFERENCIA: tiene que llevar a la DEFINICIÓN del árbol.
  //    `saludar(mensaje)` está en la línea 11 (0-based 10) y `function saludar`
  //    en la 8 (0-based 7). Con locals.scm el salto es EXACTO; con un grep
  //    ingenuo podría ir a cualquier lado.
  const atReference = await clickLine(10)
  check('el cursor quedó sobre la referencia `saludar(...)`', atReference?.line === 10, JSON.stringify(atReference))
  await pressKey('F12', 'F12', 123)
  await wait(1200)
  const atDefinition = await readStatusCursor()
  check(
    'F12 lleva a la DEFINICIÓN resuelta por el árbol (Ln 8)',
    atDefinition?.line === 7,
    `cursor: ${JSON.stringify(atDefinition)}`
  )

  // 2) Shift+Alt+→ (expandir selección) con los objetos de texto del árbol.
  //    El cursor está en `function saludar(...) {`: el objeto más chico que lo
  //    contiene es `function.outer`.
  const shotBeforeExpand = readShot(await captureEditor('4d-antes-expandir'))
  await pressKey('ArrowRight', 'ArrowRight', 39, 9) // 9 = Shift(8) | Alt(1) en CDP
  await wait(900)
  const shotAfterExpand = readShot(await captureEditor('4d-despues-expandir'))
  const expandDiff =
    shotBeforeExpand && shotAfterExpand
      ? diffStrong(shotBeforeExpand, shotAfterExpand, { x: textOrigin + 4, y: 0, width: geo.width - textOrigin - 4, height: geo.height })
      : null
  check(
    'Shift+Alt+→ selecciona el objeto de texto del árbol (se pinta la selección)',
    (expandDiff?.changed ?? 0) > 300,
    `${expandDiff?.changed ?? 0} px del texto cambiaron`
  )
  console.log('  muestras del pintado de la selección:', JSON.stringify(expandDiff?.samples))

  // La prueba DEFINITIVA de QUÉ quedó seleccionado: Ctrl+C y se lee el
  // portapapeles. El motor escribe ahí el texto de su selección (copy.cpp), así
  // que lo que aparece es literalmente lo seleccionado — no una inferencia de
  // píxeles. `function saludar(nombre){...}` es exactamente el objeto
  // `function.outer` que declaró el árbol.
  await pressKey('c', 'KeyC', 67, 2) // 2 = Ctrl en CDP
  await wait(900)
  const clipboard = await evaluate(currentWs, `navigator.clipboard.readText()`)
  const copied = typeof clipboard.value === 'string' ? clipboard.value : ''
  check(
    'el portapapeles tiene el OBJETO de texto del árbol (Ctrl+C)',
    /function saludar\(nombre\)/.test(copied) && /return nombre/.test(copied),
    JSON.stringify(copied)
  )

  // Y una segunda pulsación ya no tiene objeto más grande: el comando lo dice
  // en vez de quedarse mudo (que es como se ve un feature a medias).
  await pressKey('ArrowRight', 'ArrowRight', 39, 9)
  await wait(900)
  const expandNotice = await evaluate(
    ws,
    `[...document.querySelectorAll('*')].some((el) => el.children.length === 0 && /objeto de texto más grande/i.test(el.textContent ?? ''))`,
    { awaitPromise: false }
  )
  check('al no haber objeto más grande, avisa', expandNotice.value === true, String(expandNotice.value))

  // 3) Plegado: click REAL en el chevron del gutter. El rango lo puso el ÁRBOL
  //    (`folds.scm`) y el motor lo dibuja a `xOffset - 6` (GutterLayout). Se
  //    prueban los 3 px alrededor porque el chequeo es la CONSECUENCIA visible:
  //    las líneas del cuerpo del bloque desaparecen.
  const textRegion = { x: textOrigin + 6, y: 0, width: geo.width - textOrigin - 6, height: geo.height }
  const shotBeforeFold = readShot(await captureEditor('4d-antes-plegar'))
  const foldLine = await aim(7)
  let foldedWith = null
  for (const dx of [6, 9, 3]) {
    await clickAt(geo.x + textOrigin - dx, geo.y + (foldLine?.y ?? top + 7.5 * lineHeight))
    await wait(800)
    const shot = readShot(await captureEditor(`4d-plegado-${dx}px`))
    const diff = shotBeforeFold && shot ? diffStrong(shotBeforeFold, shot, textRegion) : null
    if ((diff?.changed ?? 0) > 400) {
      foldedWith = { dx, diff }
      break
    }
  }
  check(
    'el click en el chevron del gutter PLIEGA el bloque del árbol',
    Boolean(foldedWith),
    foldedWith
      ? `${foldedWith.diff.changed} px del texto desaparecieron (chevron a ${foldedWith.dx}px del texto)`
      : 'ningún x del gutter plegó el bloque'
  )
  await captureEditor('4d-con-el-bloque-plegado')

  // ── 5. CONTROL: sin la extensión, el mismo archivo NO tiene color ───────
  // El fondo de la app tiene degradado, así que "hay píxeles con matiz" podría
  // pasar sin tokens. La prueba real es el A/B: se desinstala el paquete de
  // lenguaje, se abre el MISMO archivo y el color tiene que caer.
  console.log('\n=== 5. control: el mismo archivo sin la extensión ===')
  const removed = await evaluate(ws, `window.api.extensions.uninstall(${JSON.stringify(EXTENSION_ID)})`)
  check('la extensión se desinstala', removed.value?.success === true, JSON.stringify(removed.value))
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(4000)
  await waitForBridge(ws)
  await wait(8000)
  const shotPlain = await captureEditor('editor-sin-extension')

  // La prueba del pintado: mismo archivo, mismo rect, una captura con la
  // extensión y otra sin ella. Los píxeles que pasan de NEUTRO (texto blanco)
  // a VÍVIDO (color) son, literalmente, los tokens que la extensión pintó.
  // No se mide "cantidad de color" en una sola imagen: el fondo del editor es
  // semitransparente sobre un wallpaper con degradado y eso daba falso positivo.
  const before = readShot(shotPlain)
  const after = readShot(shotWithExt)
  const diff = before && after ? diffNeutralToVivid(before, after) : null
  check(
    'la extensión pinta tokens con color (A/B de capturas)',
    (diff?.vivid ?? 0) >= 100,
    `${diff?.vivid ?? 0} px que pasaron de gris/blanco a color · ${diff?.strong ?? 0} cambios fuertes`
  )
  console.log('  muestras de píxeles que cambiaron:', JSON.stringify(diff?.samples))

  // ── 6. El comando del usuario: "Capturar el editor (PNG)" ───────────────
  console.log('\n=== 6. comando de captura del editor (feature de la app) ===')
  const reinstalled = await evaluate(ws, `window.api.extensions.installSef(${JSON.stringify(SEF)})`)
  check('la extensión se reinstala', reinstalled.value?.success === true, reinstalled.value?.error)
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(4000)
  await waitForBridge(ws)
  await wait(8000)

  const ranCapture = await runPaletteCommand('capturar el editor', '/capturar el editor/i')
  check('la paleta ejecuta "Capturar el editor (PNG)"', ranCapture)
  await wait(3000)
  const notified = await evaluate(
    ws,
    `JSON.stringify({
       aviso: [...document.querySelectorAll('*')].some(
         (el) => el.children.length === 0 && /Captura del editor guardada/i.test(el.textContent ?? '')
       ),
       ruta: [...document.querySelectorAll('*')]
         .map((el) => el.textContent ?? '')
         .find((text) => /innerta-\d{8}-\d{6}\.png/.test(text)) ?? null
     })`,
    { awaitPromise: false }
  )
  const notice = JSON.parse(notified.value ?? '{}')
  check('la app avisa dónde quedó la captura', notice.aviso === true, noticedText(notified.value))
  if (notice.ruta) console.log(`  captura del comando → ${notice.ruta}`)

  console.log(
    `\ncapturas para mirar:\n  ${shotWithExt?.path ?? '(sin captura del editor con extensión)'}` +
      `\n  ${shotPlain?.path ?? '(sin captura del editor sin extensión)'}`
  )
  console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} CHECKS FALLARON`}`)
  cleanup()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('probe falló:', error)
  cleanup()
  process.exit(1)
})

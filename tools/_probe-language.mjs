/**
 * Probe temporal: EXTENSIÓN DE LENGUAJE end-to-end en la app compilada.
 *
 * Qué verifica (sobre la app real, perfil limpio, con el VSIX REAL de Gleam):
 *  1. El `.vsix` se instala y el manifest TRADUCIDO declara el lenguaje y su
 *     gramática TextMate (con la ruta del paquete).
 *  2. El tokenizador del main tokeniza la gramática REAL y devuelve scopes
 *     (`comment.line.double-slash.gleam`, `keyword`, `string`…).
 *  3. El canal de color del motor acepta el payload delta (puntero del heap,
 *     no un array JS) y lo devuelve idéntico por `GetInnertaSemanticTokens`:
 *     es la prueba de que los tokens del host LLEGAN al engine.
 *  4. Abrir un `.gleam` de verdad en el editor no rompe y el archivo queda
 *     montado (screenshot para revisar a ojo).
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-language'
const PROFILE_ABS = join(process.cwd(), PROFILE)
const PORT = 9337
const VSIX = process.argv[2] ?? join(process.env.HOME ?? '/root', 'Descargas/gleam.gleam-2.13.0.vsix')
/** VSIX propio que sólo abre un archivo (ver tools/_make-openfile-vsix.mjs). */
const OPENER_VSIX = '/tmp/scrakk-openfile-1.0.0.vsix'
const SAMPLE = join(process.cwd(), 'probe-language-sample.gleam')
const SAMPLE_NAME = 'probe-language-sample.gleam'

if (!existsSync(VSIX)) {
  console.error(`no encuentro el vsix: ${VSIX}`)
  process.exit(1)
}
if (!existsSync(OPENER_VSIX)) {
  console.error(`no encuentro el vsix propio: ${OPENER_VSIX} (corré tools/_make-openfile-vsix.mjs)`)
  process.exit(1)
}

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })
writeFileSync(
  SAMPLE,
  [
    '// Comentario para probar el color de comentario',
    'import gleam/io',
    '',
    'pub fn main() {',
    '  let mensaje = "hola desde gleam"',
    '  let numero = 42',
    '  io.println(mensaje)',
    '  numero',
    '}',
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
      if (text.includes('[languages]')) console.log(`[renderer:${msg.params.type}] ${text}`)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})

  const waitForBridge = async () => {
    for (let i = 0; i < 60; i++) {
      const ready = await evaluate(
        ws,
        `document.readyState === 'complete' && !!window.api?.extensions?.tokenize`,
        { awaitPromise: false }
      )
      if (ready.value === true) return true
      await wait(1000)
    }
    return false
  }

  // Onboarding afuera: en un perfil limpio el wizard tapa todo.
  await wait(2500)
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       // La raíz del explorador vive en storage: sin esto el árbol está vacío y
       // no hay forma de abrir el archivo de prueba desde la UI.
       // OJO: la clave se guarda CRUDA (localStorage.getItem sin JSON.parse).
       localStorage.setItem('scrakk-studio:root-path', ${JSON.stringify(process.cwd())})
       return true
     })()`,
    { awaitPromise: false }
  )
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(4000)
  check('el puente nativo está listo', await waitForBridge())

  // ── 1. Instalar el VSIX real ─────────────────────────────────────────────
  console.log('\n=== 1. installVsix(gleam) ===')
  const installed = await evaluate(ws, `window.api.extensions.installVsix(${JSON.stringify(VSIX)})`)
  const info = installed.value
  console.log('install →', JSON.stringify(info)?.slice(0, 800))
  check('el VSIX real se instala', installed.ok && info?.success === true, info?.error)
  if (!info?.success) return
  const extDir = info.extension?.dir
  check('la extensión tiene directorio de paquete', typeof extDir === 'string', extDir)

  const manifestRaw = await evaluate(
    ws,
    `window.api.fs.readFile(${JSON.stringify(`${extDir}/manifest.json`)})`
  )
  const manifestText = manifestRaw.value?.content ?? '{}'
  const manifest = JSON.parse(manifestText)
  const languages = manifest.contributes?.languages ?? []
  // El kit de SEF anida las gramáticas en el lenguaje (`languages[].grammars`),
  // igual que snippets y configurationDefaults: es UNA contribución con piezas.
  const grammars = languages.flatMap((lang) => lang.grammars ?? [])
  const gleamKit = languages.find((lang) => lang.id === 'gleam')
  check('el manifest traducido declara el lenguaje', Boolean(gleamKit), JSON.stringify(languages.map((l) => l.id)))

  const grammar = grammars.find((g) => g.scopeName === 'source.gleam')
  check('el manifest traducido declara la gramática TextMate', Boolean(grammar), JSON.stringify(grammars.map((g) => g.scopeName)))
  check('la gramática tiene ruta dentro del paquete', typeof grammar?.path === 'string', grammar?.path)
  check(
    'la gramática de inyección de markdown no se pierde',
    grammars.some((g) => g.scopeName === 'markdown.gleam.codeblock'),
    JSON.stringify(grammars.map((g) => g.scopeName))
  )
  check(
    'el kit trae snippets y defaults',
    (gleamKit?.snippets?.length ?? 0) > 0 && Boolean(gleamKit?.configurationDefaults),
    JSON.stringify({ snippets: gleamKit?.snippets?.length, defaults: gleamKit?.configurationDefaults })
  )
  // El registro de lenguajes vive en el RENDERER y se arma al arrancar
  // (`loadInstalledExtensions`). Instalar por IPC no lo toca: se recarga para
  // que el lenguaje quede registrado como en un uso normal (instalar → reiniciar).
  const installedOpener = await evaluate(
    ws,
    `window.api.extensions.installVsix(${JSON.stringify(OPENER_VSIX)})`
  )
  check('la extensión que abre archivos se instala', installedOpener.value?.success === true, installedOpener.value?.error)
  const openerId = installedOpener.value?.extension?.id
  console.log('  id instalado:', openerId)

  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(4000)
  check('la app vuelve a arrancar con las extensiones registradas', await waitForBridge())

  const grammarPathOrNull = typeof grammar?.path === 'string' ? grammar.path : null
  if (!grammarPathOrNull) {
    console.log('\n(el manifest traducido no trae la gramática: se corta acá)')
    return
  }

  // ── 2. El tokenizador del main con la gramática REAL ────────────────────
  console.log('\n=== 2. tokenize (gramática real de Gleam) ===')
  const grammarPath = `${extDir}/${grammarPathOrNull.replace(/^\.\//, '')}`
  const code = readFileSync(SAMPLE, 'utf-8')
  const tokenized = await evaluate(
    ws,
    `window.api.extensions.tokenize(${JSON.stringify({
      scopeName: 'source.gleam',
      grammars: [{ scopeName: 'source.gleam', path: grammarPath }],
      text: code
    })})`
  )
  const result = tokenized.value
  check('el tokenizado devuelve ok', tokenized.ok && result?.ok === true, result?.error)
  check('devolvió tokens', (result?.tokens?.length ?? 0) > 0, `${result?.tokens?.length ?? 0} tokens`)
  const flatScopes = (result?.scopeSets ?? []).flat().join(' | ')
  check('hay scopes de comentario', flatScopes.includes('comment'), '')
  check('hay scopes de keyword', flatScopes.includes('keyword.control') || flatScopes.includes('keyword'), '')
  check('hay scopes de string', flatScopes.includes('string.quoted'), '')
  console.log('  scopes distintos:', new Set((result?.scopeSets ?? []).flat()).size)

  // ── 3. El canal de color del motor (wasm compilado de verdad) ───────────
  console.log('\n=== 3. canal de tokens del motor (SetInnertaSemanticTokens) ===')
  // Se instancia un módulo Innerta APARTE para no tocar el editor que el
  // usuario está mirando. Se empuja el MISMO payload delta que produce el
  // renderer (leyenda, 5 enteros por token) y se lee de vuelta del engine.
  const channel = await evaluate(
    ws,
    `(async () => {
       const canvas = document.createElement('canvas')
       canvas.width = 320; canvas.height = 200
       const mod = await window.createInnertaModule({ canvas, locateFile: (f) => new URL('innerta/' + f, document.baseURI).href })
       mod._InitInnerta(0, 0, 0, 320, 200)
       mod._SetInnertaLanguage = mod._SetInnertaLanguage
       // 3 tokens: keyword (leyenda 15), string (18), comment (17).
       const deltas = [0, 0, 6, 15, 0, 0, 7, 4, 18, 0, 2, 0, 9, 17, 0]
       const arr = Int32Array.from(deltas)
       const ptr = mod._malloc(arr.byteLength)
       mod.HEAP32.set(arr, ptr >> 2)
       mod._SetInnertaSemanticTokens(ptr, arr.length)
       mod._free(ptr)
       const countPtr = mod._malloc(4)
       const outPtr = mod._GetInnertaSemanticTokens(countPtr)
       const count = mod.HEAP32[countPtr >> 2]
       const read = count > 0 ? Array.from(new Int32Array(mod.HEAP32.buffer, outPtr, count)) : []
       mod._free(countPtr)
       const sourceBefore = mod._GetInnertaHighlightSource()
       mod._SetInnertaHighlightSource(2)
       const sourceAfter = mod._GetInnertaHighlightSource()
       mod._SetInnertaLanguage(0)
       mod._ShutdownInnerta()
       return { count, read, deltas, sourceBefore, sourceAfter }
     })()`
  )
  const chan = channel.value
  if (!channel.ok || !chan) {
    check('el canal del motor responde', false, channel.error)
  } else {
    check('el motor guardó el payload', chan.count === chan.deltas.length, `count=${chan.count}`)
    check(
      'el payload vuelve idéntico (sin corrimientos)',
      JSON.stringify(chan.read) === JSON.stringify(chan.deltas)
    )
    check('la fuente de resaltado se puede fijar (0/1/2)', chan.sourceAfter === 2, `${chan.sourceBefore} → ${chan.sourceAfter}`)
  }

  // ── 4. Abrir el archivo real en el editor ───────────────────────────────
  console.log('\n=== 4. abrir el .gleam en el editor ===')
  // El árbol de archivos es el slot `explorer` del layout y se abre con el
  // comando del registry (`layout.toggleExplorer`, keybinding mod+b). El botón
  // de la activity bar abre OTRA cosa (la vista del tooldock), así que acá se
  // dispara el atajo real.
  // Se abre el archivo con una EXTENSIÓN propia que corre `vscode.open`
  // (`tools/_make-openfile-vsix.mjs`): el explorador en un probe headless
  // depende del slot del layout y de la carga del árbol, y un fallo ahí no
  // dice nada sobre el lenguaje. Esto en cambio es la cadena REAL que usa una
  // extensión para abrir un documento.
  // `executeCommand` NO levanta el host por su cuenta: primero hay que
  // asegurarlo (en uso normal lo hace abrir su vista/panel). Sin este paso el
  // probe se comería un "no hay Extension Host para …" y no probaría nada.
  const ensured = await evaluate(
    ws,
    `window.api.extensions.host.ensure({
       id: ${JSON.stringify(openerId)},
       workspaceRoots: [${JSON.stringify(process.cwd())}],
       mode: 'compat'
     })`
  )
  console.log('  ensure →', JSON.stringify(ensured.value ?? ensured.error)?.slice(0, 300))
  await wait(3000)
  const openedByExtension = await evaluate(
    ws,
    `window.api.extensions.host.executeCommand({
       id: ${JSON.stringify(openerId)},
       command: 'demo.openFile',
       args: [${JSON.stringify(SAMPLE)}]
     })`
  )
  console.log('  vscode.open →', JSON.stringify(openedByExtension.value ?? openedByExtension.error)?.slice(0, 300))
  await wait(6000)

  // Input.dispatchKeyEvent (CDP) y no un KeyboardEvent sintético: el atajo lo
  // maneja el servicio de shortcuts, que ignora eventos no confiables.
  const pressKey = async (key, code, vk, modifiers) => {
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers
    })
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers
    })
  }
  await pressKey('b', 'KeyB', 66, 2)
  await wait(3000)
  // Ctrl+B puede no llegar si el panel todavía no está montado (el layout
  // arranca con el slot izquierdo cerrado): la paleta de comandos corre el
  // MISMO comando del registry y es más robusto.
  const hasTree = await evaluate(
    ws,
    `!![...document.querySelectorAll('*')].find(
       (el) => el.children.length === 0 && el.textContent?.trim() === ${JSON.stringify(SAMPLE_NAME)}
     )`,
    { awaitPromise: false }
  )
  if (hasTree.value !== true) {
    await pressKey('P', 'KeyP', 80, 10) // Ctrl+Shift+P
    await wait(1200)
    const palette = await evaluate(
      ws,
      `(() => {
         const input = document.querySelector('input[role="combobox"], [data-command-palette] input, input')
         if (!input) return { found: false, texts: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent?.trim()).map((e) => e.textContent.trim()).slice(0, 30) }
         const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
         setter.call(input, 'explorador')
         input.dispatchEvent(new Event('input', { bubbles: true }))
         return { found: true, value: input.value }
       })()`,
      { awaitPromise: false }
    )
    console.log('  paleta:', JSON.stringify(palette.value)?.slice(0, 400))
    await wait(1200)
    const ran = await evaluate(
      ws,
      `(() => {
         const items = [...document.querySelectorAll('*')]
           .filter((el) => el.children.length === 0 && /explorador/i.test(el.textContent ?? ''))
         const item = items[items.length - 1]
         if (!item) return false
         ;(item.closest('[role="option"], li, button, div') ?? item).click()
         return true
       })()`,
      { awaitPromise: false }
    )
    check('la paleta de comandos ejecuta el comando del explorador', ran.value === true)
    await wait(3000)
  }
  const buttons = await evaluate(
    ws,
    `JSON.stringify([...document.querySelectorAll('[data-button-id]')].map((el) => el.dataset.buttonId))`,
    { awaitPromise: false }
  )
  console.log('  botones de la activity bar:', buttons.value)

  const rowsInfo = await evaluate(
    ws,
    `JSON.stringify([...document.querySelectorAll('*')]
       .filter((el) => el.children.length === 0 && el.textContent?.includes(${JSON.stringify(SAMPLE_NAME)}))
       .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 60) })))`,
    { awaitPromise: false }
  )
  console.log('  nodos con el nombre del archivo:', rowsInfo.value)
  const domLeaves = await evaluate(
    ws,
    `JSON.stringify([...document.querySelectorAll('*')]
       .filter((el) => el.children.length === 0 && el.textContent?.trim())
       .map((el) => el.textContent.trim())
       .filter((text) => text.length < 60)
       .slice(0, 60))`,
    { awaitPromise: false }
  )
  console.log('  texto visible (primeros 60):', domLeaves.value)

  const opened = await evaluate(
    ws,
    `(() => {
       const rows = [...document.querySelectorAll('*')].filter(
         (el) => el.children.length === 0 && el.textContent?.trim() === ${JSON.stringify(SAMPLE_NAME)}
       )
       const row = rows[0]
       if (!row) return { clicked: false }
       const target = row.closest('[role="button"], [class*="row"], li, div') ?? row
       target.click()
       return { clicked: true, tag: target.tagName }
     })()`,
    { awaitPromise: false }
  )
  check('el archivo se puede clickear en el explorador', opened.value?.clicked === true)
  await wait(6000)

  const editorState = await evaluate(
    ws,
    `(() => {
       const canvas = document.querySelector('.scrakk-innerta-canvas')
       return {
         canvas: !!canvas,
         width: canvas?.width ?? 0,
         height: canvas?.height ?? 0
       }
     })()`,
    { awaitPromise: false }
  )
  check('el editor Innerta montó el archivo', editorState.value?.canvas === true, JSON.stringify(editorState.value))

  const tabInfo = await evaluate(
    ws,
    `JSON.stringify({
       hasTab: [...document.querySelectorAll('*')].some(
         (el) => el.children.length === 0 && el.textContent?.trim() === ${JSON.stringify(SAMPLE_NAME)}
       ),
       tabs: [...document.querySelectorAll('[class*="tab" i]')].map((el) => el.textContent?.trim().slice(0, 30)).filter(Boolean).slice(0, 8)
     })`,
    { awaitPromise: false }
  )
  console.log('  tabs:', tabInfo.value)
  check(
    'la extensión abrió el archivo (aparece la tab)',
    String(tabInfo.value ?? '').includes(SAMPLE_NAME)
  )

  // El color del archivo abierto se mide en PÍXELES sobre el screenshot: es la
  // única forma de comprobar que la gramática de la extensión llegó a pintar y
  // no sólo que los tokens viajaron. Se dibuja el PNG en un canvas 2D del
  // propio renderer (decodificarlo en Node necesitaría un decoder de PNG) y se
  // cuentan colores distintos dentro del canvas del editor.
  const bounds = await evaluate(
    ws,
    `(() => {
       const canvas = document.querySelector('.scrakk-innerta-canvas')
       if (!canvas) return null
       const r = canvas.getBoundingClientRect()
       return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
     })()`,
    { awaitPromise: false }
  )
  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const region = bounds.value ?? { x: 0, y: 0, w: 700, h: 400 }
  if (shot?.data) {
    mkdirSync('release', { recursive: true })
    writeFileSync('release/_probe-language.png', Buffer.from(shot.data, 'base64'))
    console.log('screenshot → release/_probe-language.png')
  }
  if (shot?.data && region) {
    const colors = await evaluate(
      ws,
      `(async () => {
         const img = new Image()
         img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}
         await img.decode()
         const canvas = document.createElement('canvas')
         canvas.width = img.width
         canvas.height = img.height
         const ctx = canvas.getContext('2d', { willReadFrequently: true })
         ctx.drawImage(img, 0, 0)
         const crop = ctx.getImageData(${region.x}, ${region.y}, ${Math.max(1, region.w)}, ${Math.max(1, region.h)}).data
         const counts = new Map()
         for (let i = 0; i < crop.length; i += 4) {
           const key = crop[i] + ',' + crop[i + 1] + ',' + crop[i + 2]
           counts.set(key, (counts.get(key) ?? 0) + 1)
         }
         // Un color de TOKEN tiene tinte (los canales no son iguales); el
         // fondo, el texto y el antialiasing son grises. Contar tintes separa
         // "pintó la gramática" de "el archivo se abrió".
         const tinted = new Map()
         for (let i = 0; i < crop.length; i += 4) {
           const r = crop[i]
           const g = crop[i + 1]
           const b = crop[i + 2]
           const max = Math.max(r, g, b)
           const min = Math.min(r, g, b)
           if (max - min < 14) continue
           const key = r + ',' + g + ',' + b
           tinted.set(key, (tinted.get(key) ?? 0) + 1)
         }
         const topTinted = [...tinted.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
         const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
         const tintedPixels = [...tinted.values()].reduce((sum, n) => sum + n, 0)
         return { distinct: counts.size, top, tinted: tinted.size, tintedPixels, topTinted }
       })()`
    )
    const stats = colors.value
    console.log('  colores distintos:', stats?.distinct, '| colores de token (con tinte):', stats?.tinted, `| píxeles con tinte: ${stats?.tintedPixels}`)
    console.log('  dominantes:', JSON.stringify(stats?.top))
    console.log('  dominantes con tinte:', JSON.stringify(stats?.topTinted))
    // El texto por defecto y el antialiasing son grises: si aparecen píxeles
    // con TINTE dentro del canvas del editor, el color salió de la gramática.
    check(
      'el editor pintó tokens con color (no sólo texto gris)',
      (stats?.tintedPixels ?? 0) > 50,
      `tinted=${stats?.tinted} pixels=${stats?.tintedPixels} `+
      `ejemplo=${JSON.stringify(stats?.topTinted?.[0] ?? null)}`
    )
  }

  console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} CHEQUEOS FALLARON`}`)
}

main()
  .catch((error) => {
    console.error('probe falló:', error?.stack ?? error)
    failures++
  })
  .finally(async () => {
    await wait(500)
    cleanup()
    process.exit(failures === 0 ? 0 : 1)
  })

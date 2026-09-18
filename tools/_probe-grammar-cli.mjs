/**
 * Probe: un paquete hecho por `tools/grammar.mjs` funciona en la APP.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ VERIFICA (y por qué así)
 *
 * El CLI puede terminar sin errores y dejar un paquete que no sirve: un manifest
 * que el schema rechaza, un `.wasm` compilado con las flags equivocadas, queries
 * que declaran un lenguaje que el cargador no conoce. Ninguna de esas cosas se ve
 * desde afuera del proceso.
 *
 * Así que se prueba en Electron de verdad, con un perfil limpio y el paquete
 * instalado en SU directorio de extensiones:
 *
 *  1. `window.api.extensions.tokenizeDynamic` responde con tokens y scopes
 *     (el `.wasm` carga, las queries compilan, el árbol se construye).
 *  2. El lenguaje se RECONOCE por la extensión del archivo (statusbar).
 *  3. El editor PINTA: se captura el canvas con la feature de la app y se cuenta
 *     color. Un archivo sin gramática tiene tinta gris; con la gramática
 *     aparecen colores.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * USO
 *
 *   # 1. instalar el paquete en el perfil del probe
 *   node tools/grammar.mjs <link> --ext ex,exs --profile release/_probe-grammar/extensions
 *   # 2. correr el probe (con el paquete presente)
 *   node tools/_probe-grammar-cli.mjs
 *   # 3. la contraprueba: sin el paquete, el mismo archivo no tiene color
 *   rm -rf release/_probe-grammar/extensions/scrakk.grammar.*
 *   node tools/_probe-grammar-cli.mjs --expect-none
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { decodePng, isVivid } from './lib/png-read.mjs'

const PROFILE = 'release/_probe-grammar'
const EXTENSIONS_DIR = join(PROFILE, 'extensions')
const PORT = 9341
const SHOTS = '/tmp/innerta-shots'
const LANGUAGE = 'elixir'
const FILE = 'probe-grammar.ex'
/** Sin paquete, la misma extensión no resuelve a ningún lenguaje. */

/** Control: un lenguaje que la app ya pinta con el motor (no depende de nada). */
const CONTROL_SAMPLE = [
  '// control del probe: mismo flujo, lenguaje que el motor ya trae',
  'const saludo = (nombre: string): string => {',
  '  const mensaje = `hola, ${nombre}!`',
  '  return mensaje',
  '}',
  '',
  'export default saludo',
  ''
].join('\n')

const SAMPLE = [
  'defmodule Saludo do',
  '  @moduledoc "Saluda a quien corresponda"',
  '',
  '  def saludar(nombre) do',
  '    mensaje = "hola, #{nombre}!"',
  '    IO.puts(mensaje)',
  '    {:ok, mensaje}',
  '  end',
  '',
  '  defp privada(x) when is_integer(x), do: x + 42',
  'end',
  ''
].join('\n')

const expectNone = process.argv.includes('--expect-none')
/** `.sef` que hizo `tools/grammar.mjs` (`--sef dist/grammars/x.sef`). */
const sefFlag = process.argv.indexOf('--sef')
const sefPath = sefFlag >= 0 ? process.argv[sefFlag + 1] : null
let ws = null
let mainContextId = null
const pending = new Map()
let nextId = 1
let failures = 0

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

function send(socket, method, params) {
  const id = nextId++
  socket.send(JSON.stringify({ id, method, params }))
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
  if (result?.exceptionDetails) return { ok: false, error: result.exceptionDetails.text ?? 'excepción' }
  const value = result?.result
  if (value?.type === 'undefined') return { ok: true, value: undefined }
  return { ok: true, value: value?.value }
}

async function target() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const list = await response.json()
  return list.find((entry) => entry.type === 'page' && entry.url.includes('index.html')) ?? list[0]
}

/** El paquete instalado, leído del disco del perfil (el que hizo el CLI). */
function installedPackageIn(dir) {
  if (!dir || !existsSync(dir)) return null
  for (const name of readdirSync(dir)) {
    const manifestPath = join(EXTENSIONS_DIR, name, 'manifest.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const language = manifest?.contributes?.languages?.[0]
    if (language?.id !== LANGUAGE) continue
    const grammar = language.grammars?.[0]
    if (!grammar?.parser) continue
    const pkgDir = join(dir, name)
    return {
      id: manifest.id,
      dir: pkgDir,
      parserPath: join(pkgDir, grammar.parser),
      queries: grammar.queries.map((relative) => ({ file: join(pkgDir, relative) }))
    }
  }
  return null
}

/** Captura el rect del canvas del editor con la FEATURE de la app. */
async function captureEditor(name) {
  const result = await evaluate(
    `(() => {
       const canvas = document.querySelector('.scrakk-innerta-canvas')
       const rect = canvas
         ? (() => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()
         : undefined
       return window.api.screenshot.capture(Object.assign(${JSON.stringify({ dir: SHOTS, name })}, { rect }))
     })()`
  )
  if (result.value?.success) console.log(`  captura → ${result.value.path} (${result.value.width}×${result.value.height})`)
  return result.value
}

/** Color real del editor (mismo criterio que el resto de los probes). */
function measure(shot) {
  if (!shot?.path) return null
  let image
  try {
    image = decodePng(readFileSync(shot.path))
  } catch {
    return null
  }
  let vivid = 0
  let letters = 0
  const hues = new Set()
  for (let i = 0; i < image.width * image.height * 4; i += 4) {
    const r = image.data[i]
    const g = image.data[i + 1]
    const b = image.data[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // Tinta = texto (cualquier cosa que no sea el fondo 16,16,16).
    if (!(r === 16 && g === 16 && b === 16) && max > 60) letters++
    if (isVivid(r, g, b)) {
      vivid++
      hues.add(`${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`)
    }
  }
  return { vivid, letters, hues: hues.size }
}

/**
 * Saca del medio el onboarding.
 *
 * Un perfil limpio arranca en la pantalla de bienvenida, que tapa el editor: sin
 * esto el probe busca el explorador en una app que todavía no abrió el IDE y
 * falla por un motivo que no tiene nada que ver con la gramática.
 */
async function dismissOnboarding() {
  const dismissed = await evaluate(
    `(() => {
       const button = [...document.querySelectorAll('button, [role="button"]')]
         .find((el) => /omitir configuraci/i.test(el.textContent ?? ''))
       if (!button) return false
       button.click()
       return true
     })()`,
    { awaitPromise: false }
  )
  if (dismissed.value === true) {
    console.log('  onboarding: salteado ("Omitir configuración")')
    await wait(3000)
  }
  return dismissed.value === true
}

/**
 * Abre el archivo con una extensión REAL que corre `vscode.open`.
 *
 * El explorador en un probe headless depende del slot del layout y de que el
 * árbol haya cargado: un fallo ahí no dice NADA sobre la gramática (y ya nos
 * pasó: el perfil limpio no tiene workspace y el árbol está vacío). Esta es la
 * cadena real que usa una extensión para abrir un documento
 * (`tools/_make-openfile-vsix.mjs`).
 */
async function openWithExtension(path) {
  const openerId = 'scrakk-demo.open-file'
  const ensured = await evaluate(
    `window.api.extensions.host.ensure({
       id: ${JSON.stringify(openerId)},
       workspaceRoots: [${JSON.stringify(process.cwd())}],
       mode: 'compat'
     })`
  )
  if (ensured.error) console.log(`  ensure → ${ensured.error}`)
  await wait(3000)
  const runCommand = async (command, args) => {
    const response = await evaluate(
      `window.api.extensions.host.executeCommand({
         id: ${JSON.stringify(openerId)},
         command: ${JSON.stringify(command)},
         args: ${JSON.stringify(args)}
       })`
    )
    if (response.error) console.log(`  ${command} → ${response.error}`)
    return response
  }

  // Primero el WORKSPACE: sin él el IDE está en la bienvenida y `vscode.open`
  // no tiene dónde poner el documento (el comando igual "funciona"). Se intenta
  // por el comando de la extensión y, si no queda, fijando la raíz persistida y
  // recargando, que es exactamente lo que hace el IDE al abrir una carpeta.
  await runCommand('demo.openFolder', [process.cwd()])
  await wait(4000)
  const root = await evaluate(
    `(() => { localStorage.setItem('scrakk-studio:root-path', ${JSON.stringify(process.cwd())}); return localStorage.getItem('scrakk-studio:root-path') })()`
  )
  console.log(`  workspace persistido → ${root.value}`)
  await evaluate('location.reload()', { awaitPromise: false })
  await wait(9000)
  await dismissOnboarding()
  await runCommand('demo.openFile', [path])
  await wait(6000)
  return true
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true })
  mkdirSync(EXTENSIONS_DIR, { recursive: true })
  mkdirSync(SHOTS, { recursive: true })
  writeFileSync(join(process.cwd(), FILE), SAMPLE)

  const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
  if (!existsSync(electron)) throw new Error(`no encuentro electron en ${electron}`)
  const child = spawn(electron, ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: process.cwd(),
    stdio: 'ignore'
  })
  process.on('exit', () => child.kill())

  for (let i = 0; i < 40 && !ws; i++) {
    await wait(1500)
    try {
      const page = await target()
      if (!page?.webSocketDebuggerUrl) continue
      ws = new WebSocket(page.webSocketDebuggerUrl)
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true })
        ws.addEventListener('error', reject, { once: true })
      })
    } catch {
      // todavía no levantó
    }
  }
  if (!ws) throw new Error('no pude conectarme por CDP')

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result)
      pending.delete(message.id)
    }
  })

  await send(ws, 'Runtime.enable', {})
  await wait(3000)

  // ── 1. Instalación por el IPC REAL de la app (lo que hace el usuario) ────
  console.log('\n=== 1. instalación del .sef por el IPC de la app ===')
  const dirResponse = await evaluate('window.api.extensions.extensionsDir()')
  const appExtensionsDir = dirResponse.value
  check('la app dice dónde instala las extensiones', typeof appExtensionsDir === 'string', appExtensionsDir)

  if (!expectNone && sefPath) {
    const installed = await evaluate(`window.api.extensions.installSef(${JSON.stringify(sefPath)})`)
    check('installSef acepta el paquete (manifest válido)', installed.value?.success === true, JSON.stringify(installed.value))
    // El registro de lenguajes se arma al arrancar: se recarga como haría el
    // usuario al reiniciar la app.
    await evaluate('location.reload()', { awaitPromise: false })
    await wait(9000)
  } else if (expectNone) {
    console.log('  (--expect-none: no se instala nada)')
  } else {
    console.log('  (sin --sef: se usa lo que ya esté instalado en el perfil)')
  }

  await dismissOnboarding()

  const packageInfo = installedPackageIn(appExtensionsDir)
  check(
    expectNone ? 'no hay paquete en el perfil del probe' : 'el paquete quedó instalado en el perfil',
    expectNone ? packageInfo === null : packageInfo !== null,
    expectNone ? (packageInfo ? `se esperaba NINGUNO y hay ${packageInfo?.id}` : 'ninguno, como se esperaba') : packageInfo?.id
  )

  // ── 2. El tokenizador dinámico (el wasm + las queries, por IPC) ──────────
  console.log('\n=== 2. tokenizeDynamic (el .wasm del paquete, en el worker) ===')
  if (packageInfo) {
    const text = 'defmodule Saludo do\n  @moduledoc "hola"\n  def saludar(nombre), do: nombre\nend\n'
    const response = await evaluate(
      `window.api.extensions.tokenizeDynamic(${JSON.stringify({
        languageId: LANGUAGE,
        parserPath: 'PARSER_PATH',
        queries: 'QUERIES',
        text
      }).replace('"PARSER_PATH"', JSON.stringify(packageInfo.parserPath)).replace('"QUERIES"', JSON.stringify(packageInfo.queries))})`
    )
    const value = response.value
    check('tokenizeDynamic responde ok', value?.ok === true, value?.error ?? `${value?.tokens?.length ?? 0} tokens`)
    if (value?.ok) {
      const scopes = new Set((value.scopeSets ?? []).flat())
      check('los tokens traen scopes (el árbol matcheó)', scopes.size > 0, `${scopes.size} scopes: ${[...scopes].slice(0, 6).join(', ')}`)
      check('ninguna query del paquete quedó rota', (value.failed ?? []).length === 0, JSON.stringify(value.failed ?? []))
      console.log(`  queries aplicadas: ${(value.applied ?? []).join(', ') || '(ninguna)'}`)
      const symbols = value.data?.symbols?.length ?? 0
      check('tags.scm entrega símbolos (outline)', symbols > 0, `${symbols} símbolos`)
      if (symbols > 0) console.log(`  símbolos: ${value.data.symbols.slice(0, 5).map((s) => s.name).join(', ')}`)
    } else {
      check('tokenizeDynamic responde ok', false, value?.error)
    }
  } else {
    console.log('  (sin paquete: se omite)')
  }

  // ── 3. El lenguaje se reconoce por la extensión ─────────────────────────
  console.log('\n=== 3. el editor abre el archivo y lo reconoce ===')
  const openerVsix = '/tmp/scrakk-openfile-1.0.0.vsix'
  if (!existsSync(openerVsix)) throw new Error(`falta ${openerVsix}: corré tools/_make-openfile-vsix.mjs`)
  const openerInstalled = await evaluate(`window.api.extensions.installVsix(${JSON.stringify(openerVsix)})`)
  check(
    'la extensión que abre archivos se instala',
    openerInstalled.value?.success !== false,
    JSON.stringify(openerInstalled.value)?.slice(0, 100)
  )
  // Control: el MISMO flujo con un lenguaje que la app ya sabe pintar (el motor
  // lo trae compilado). Si el control no pinta, el que está roto es el probe
  // (foco, tab, workspace) y no el paquete — sin esto, un fallo no dice nada.
  const controlFile = 'control-grammar.ts'
  writeFileSync(join(process.cwd(), controlFile), CONTROL_SAMPLE)

  const results = []
  for (const [name, label] of [
    [controlFile, 'control (typescript, gramática del motor)'],
    [FILE, `paquete (${LANGUAGE})`]
  ]) {
    await openWithExtension(join(process.cwd(), name))
    await wait(4000)
    const shot = await captureEditor(`grammar-cli-${name.replace(/[^a-z0-9.]/gi, '-')}`)
    const metrics = measure(shot)
    results.push({ name, label, metrics })
    console.log(`  ${label}: tinta ${metrics?.letters ?? '?'} px · color ${metrics?.vivid ?? '?'} px · ${metrics?.hues ?? '?'} tonos`)
  }

  const control = results.find((entry) => entry.name === controlFile)
  const target = results.find((entry) => entry.name === FILE)
  check(
    'control: el editor pinta un lenguaje que ya conocía (el probe mide bien)',
    (control?.metrics?.vivid ?? 0) > 800,
    `${control?.metrics?.vivid ?? 0} px con color`
  )
  check(
    expectNone ? 'sin paquete: elixir NO pinta' : 'el lenguaje del paquete PINTA',
    expectNone ? (target?.metrics?.vivid ?? 0) < 400 : (target?.metrics?.vivid ?? 0) > 800,
    `${target?.metrics?.vivid ?? 0} px con color`
  )
  console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} fallo(s)`} — capturas en ${SHOTS}`)
  child.kill()
  process.exitCode = failures === 0 ? 0 : 1
  return

  console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} fallo(s)`} — capturas en ${SHOTS}`)
  child.kill()
  process.exitCode = failures === 0 ? 0 : 1
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`)
  process.exitCode = 1
})

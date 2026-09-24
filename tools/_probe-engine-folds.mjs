// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe: PLEGADO POR ÁRBOL de un lenguaje EMBEBIDO (`folds.scm` del motor).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ VERIFICA
 *
 * Hasta ahora el plegado por árbol sólo llegaba por el HOST (la gramática
 * dinámica de un `.sef`). Un lenguaje de fábrica no tiene host que le empuje
 * nada, así que el motor sólo plegaba por INDENTACIÓN. Este probe verifica el
 * camino nuevo, y lo hace con la única evidencia que no se puede falsear: **el
 * propio reporte del motor**, que sale por `stderr` del wasm (Emscripten lo
 * enruta a la consola del renderer) y dice tres cosas:
 *
 *   1. cargó `queries/<lang>/folds.scm` (o no existe);
 *   2. cuántos rangos produjo la query sobre el árbol;
 *   3. cuántos aplicó el editor (o si el host se quedó con la propiedad).
 *
 * El lenguaje elegido es parte de la prueba: **TOML**, cuyas tablas no están
 * indentadas. Si hay rangos, no pueden venir de la heurística de indentación.
 *
 * El click en el chevron se prueba SÓLO con `PROBE_CLICK=1`: la coordenada de la
 * canaleta depende del ancho de los números de línea y adivinarla fue, en su
 * momento, una fuente de falsos negativos (el motor estaba bien; el probe
 * clickeaba al lado). El camino del usuario ya se verificó a mano.
 *
 * Uso:
 *   npm run build            (copia el wasm nuevo a out/renderer)
 *   node tools/_probe-engine-folds.mjs
 *   PROBE_CLICK=1 node tools/_probe-engine-folds.mjs   # además, clickea el chevron
 */

import { spawn } from 'node:child_process'
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng, diffStrong } from './lib/png-read.mjs'

const PROFILE = 'release/_probe-engine-folds'
const PORT = 9341
const SAMPLE_NAME = 'probe-engine-folds.toml'
const SAMPLE = join(process.cwd(), SAMPLE_NAME)
const CON_CLICK = process.env['PROBE_CLICK'] === '1'

// `[server]` (línea 0) es una TABLA: su nodo llega hasta el final del archivo, así
// que `folds.scm` produce un rango. `name` (línea 4) es una clave suelta: no hay
// `(table)` que la capture y tampoco indentación → el control del click.
writeFileSync(
  SAMPLE,
  ['[server]', 'host = "0.0.0.0"', 'port = 8080', '', 'name = "suelto"', ''].join('\n')
)

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const SHOTS = '/tmp/innerta-shots'
let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

/** Lo que el MOTOR dijo de sí mismo (una línea por estado, deduplicada). */
const engineLogs = []
const engineSaid = (regex) => engineLogs.find((line) => regex.test(line)) ?? null

let ws = null
let mainContextId = null
const pending = new Map()
let messageId = 0

function send(method, params) {
  const id = ++messageId
  return new Promise((resolve) => {
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression, { awaitPromise = true } = {}) {
  const message = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    ...(mainContextId === null ? {} : { contextId: mainContextId }),
    timeout: 300_000
  })
  if (!message) return { ok: false, error: 'sin respuesta de CDP' }
  if (message.exceptionDetails) {
    return { ok: false, error: message.exceptionDetails.exception?.description ?? message.exceptionDetails.text }
  }
  return { ok: true, value: message.result?.value }
}

async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const list = await res.json()
  return list.find((t) => t.type === 'page' && t.url.includes('index.html')) ?? list[0]
}

async function pressKey(key, code, vk, modifiers = 0) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers })
}

/** Abre un panel/comando por la paleta, como el usuario. */
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

/** Clickea la fila del archivo en el explorador (misma ruta que el usuario). */
async function openFromExplorer() {
  const opened = await evaluate(
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
  return opened.value?.clicked === true
}

async function canvasRect() {
  const res = await evaluate(
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

async function clickAt(x, y) {
  const point = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, pointerType: 'mouse' }
  await send('Input.dispatchMouseEvent', { ...point, type: 'mouseMoved', button: 'none', clickCount: 0 })
  await wait(80)
  await send('Input.dispatchMouseEvent', { ...point, type: 'mousePressed' })
  await send('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased' })
}

async function readStatusCursor() {
  const res = await evaluate(
    `(() => {
       const el = document.querySelector('[aria-label="Posición del cursor en el editor"]')
       return el ? (el.textContent ?? '') : null
     })()`,
    { awaitPromise: false }
  )
  const raw = typeof res.value === 'string' ? res.value : ''
  const match = raw.match(/Ln\s*(\d+)\s*,\s*Col\s*(\d+)/)
  return match ? { line: Number(match[1]) - 1, col: Number(match[2]) - 1 } : null
}

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
  return res.value
}

const readShot = (shot) => {
  if (!shot?.path) return null
  try {
    return decodePng(readFileSync(shot.path))
  } catch {
    return null
  }
}

/** Un click mueve el caret (~850 px); plegar esconde líneas (miles). */
const FOLD_PIXELS = 3000

async function main() {
  for (let i = 0; i < 40 && !ws; i++) {
    await wait(1500)
    try {
      const page = await target()
      if (!page?.webSocketDebuggerUrl) continue
      const socket = new WebSocket(page.webSocketDebuggerUrl)
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true })
        socket.addEventListener('error', reject, { once: true })
      })
      ws = socket
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
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
      if (/folds:|SyntaxHighlighter/.test(text)) {
        engineLogs.push(text)
        console.log(`[motor] ${text}`)
      }
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[renderer:error] ${msg.params.exceptionDetails?.text}`)
    }
  })
  void send('Runtime.enable', {})

  const waitReady = async () => {
    for (let i = 0; i < 60; i++) {
      const ready = await evaluate(`document.readyState === 'complete' && !!window.api?.screenshot`, { awaitPromise: false })
      if (ready.value === true) return true
      await wait(1000)
    }
    return false
  }
  await waitReady()

  // Perfil limpio: el ONBOARDING tapa la app y el explorador no tiene raíz, así
  // que la fila del archivo no existe (y mediríamos la pantalla de bienvenida).
  console.log('\n=== 0. perfil limpio (onboarding afuera, raíz en cwd) ===')
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
  await wait(4000)
  check('la app arranca sin onboarding y con la raíz del explorador', await waitReady())

  console.log('\n=== 1. un .toml (lenguaje EMBEBIDO: sin paquete, sin host) ===')
  check('la paleta abre el panel Explorador', await runPaletteCommand('explorador', '/explorador/i'))
  await wait(3000)
  check('el archivo se abre desde el explorador', await openFromExplorer())
  await wait(7000)
  check('el editor montó el canvas', Boolean(await canvasRect()))

  // ── 2. El reporte del MOTOR ──────────────────────────────────────────────
  console.log('\n=== 2. el motor carga y aplica `folds.scm` ===')
  const loaded = engineSaid(/loaded query \.\/queries\/toml\/folds\.scm/)
  check('el motor carga la query de plegado del lenguaje embebido', Boolean(loaded), loaded ?? 'no apareció en el log')

  const computed = engineSaid(/folds: toml: (\d+) rango\(s\) de folds\.scm/)
  const count = computed ? Number(/folds: toml: (\d+) rango/.exec(computed)?.[1] ?? 0) : 0
  check(
    'la query produce rangos sobre el árbol (TOML: la tabla)',
    count > 0,
    computed ?? 'el motor no reportó rangos'
  )

  const applied = engineSaid(/EditorWindow folds: toml: (\d+) rango\(s\) del motor aplicados/)
  check(
    'el editor los aplica (sin que el host se quede con la propiedad)',
    Boolean(applied),
    applied ?? 'el editor no los aplicó'
  )

  const noQuery = engineSaid(/sin folds\.scm para toml/)
  check('no es el caso "sin query" (que caería a indentación)', !noQuery, noQuery ?? 'ok')

  // ── 3. El click en el chevron (opcional) ─────────────────────────────────
  if (CON_CLICK) {
    console.log('\n=== 3. click en el chevron del gutter (PROBE_CLICK=1) ===')
    const geo = await canvasRect()
    let lineHeight = 17.2
    let top = 12
    const aim = async (line, tries = 5) => {
      for (let attempt = 0; attempt < tries; attempt++) {
        const y = top + (line + 0.5) * lineHeight
        await clickAt(geo.x + 300, geo.y + y)
        await wait(280)
        const cursor = await readStatusCursor()
        if (cursor?.line === line) return { y }
        if (cursor) top += (line - cursor.line) * lineHeight
      }
      return null
    }
    const anchor = await aim(1)
    const far = await aim(4)
    if (anchor && far) {
      lineHeight = (far.y - anchor.y) / 3
      top = anchor.y - 1.5 * lineHeight
    }
    check('la geometría vertical se verifica contra la statusbar', Boolean(anchor && far))

    const shotBefore = readShot(await captureEditor('folds-antes'))
    const tableY = geo.y + (await aim(0))?.y
    const textRegion = { x: 60, y: 0, width: geo.width - 60, height: geo.height }
    let folded = null
    const tried = []
    for (let local = 22; local <= 120 && !folded; local += 4) {
      await clickAt(geo.x + local, tableY)
      await wait(650)
      const shot = readShot(await captureEditor(`folds-tabla-x${local}`))
      const diff = shotBefore && shot ? diffStrong(shotBefore, shot, textRegion) : null
      tried.push(`${local}:${diff?.changed ?? '?'}`)
      if ((diff?.changed ?? 0) > FOLD_PIXELS) folded = { local, changed: diff.changed }
    }
    check(
      'el click en el chevron pliega el bloque del árbol',
      Boolean(folded),
      folded ? `x=${folded.local} · ${folded.changed} px` : `ningún x plegó (${tried.join(' ')})`
    )
  } else {
    console.log('\n(3. click del chevron: se salta; usar PROBE_CLICK=1)')
  }

  console.log(`\n${failures === 0 ? '✓ todo OK' : `✗ ${failures} fallo(s)`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((error) => {
    console.error(`\n✗ ${error.message}`)
    process.exitCode = 1
  })
  .finally(() => {
    cleanup()
  })

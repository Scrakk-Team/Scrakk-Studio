/**
 * Probe: ¿de qué color se pintan los iconos de error/advertencia de la barra?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PREGUNTA
 *
 * El chip de Problemas es el único de la barra que llevaba color PROPIO: el
 * icono de error en `--color-danger` y el de advertencia en `--color-warning`,
 * mientras el icono de git (y el resto) heredan el color del chip
 * (`--color-text-secondary`, y `--color-text` en hover). Eso hacía que dos
 * iconos de la barra compitieran con el texto de al lado.
 *
 * Este probe NO mira píxeles: pregunta por el **color computado**. Compara
 *
 *   1. el color de cada icono del chip de Problemas,
 *   2. el color del TEXTO del mismo chip,
 *   3. el color de un icono vecino de la barra (ajustes) — el patrón a copiar,
 *
 * y falla si (1) y (2) difieren, o si (1) coincide con `--color-danger` /
 * `--color-warning` del tema activo.
 *
 * Uso:  node tools/_probe-statusbar-problems-color.mjs
 *
 * Es un artefacto de diagnóstico, no parte del producto.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = 'release/_probe-statusbar-problems-color'
const PORT = 9351

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

/**
 * Lee el color computado del chip, de cada icono que contiene y de un chip
 * vecino de referencia. Devuelve strings `rgb(...)`, no clases: lo que importa
 * es lo que el navegador pinta al final, no la regla que lo pidió.
 */
const READ_COLORS = `(() => {
  const rgb = (el) => (el ? getComputedStyle(el).color : null)
  const chip = document.querySelector('[aria-label="Problemas"]')
  if (!chip) return { error: 'no hay chip de Problemas en el DOM' }
  // Los iconos son los hijos que NO son el numero (clase .count, con hash de
  // CSS modules en el nombre): svg del tema builtin, o glyph del tema fuente.
  const icons = [...chip.children].filter((el) => !String(el.className).includes('count'))
  const settings = document.querySelector('[aria-label="Ajustes"]')
  const settingsIcon = settings?.querySelector('svg, span') ?? null
  const root = getComputedStyle(document.documentElement)
  return {
    chip: rgb(chip),
    icons: icons.map((el) => ({ tag: el.tagName.toLowerCase(), color: rgb(el) })),
    settingsIcon: rgb(settingsIcon),
    danger: root.getPropertyValue('--color-danger').trim(),
    warning: root.getPropertyValue('--color-warning').trim(),
    text: root.getPropertyValue('--color-text-secondary').trim()
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
    }
  })
  void send(ws, 'Runtime.enable', {})
  void send(ws, 'Page.enable', {})

  // Onboarding afuera (la barra solo existe en el workspace).
  await wait(2500)
  await evaluate(
    ws,
    `(() => {
       localStorage.setItem('scrakk:onboarding.status', JSON.stringify('done'))
       localStorage.setItem('scrakk:onboarding.completedAt', JSON.stringify(Date.now()))
       return true
     })()`,
    { awaitPromise: false }
  )
  await evaluate(ws, `window.location.reload()`, { awaitPromise: false })
  mainContextId = null
  await wait(6000)

  console.log('\n=== colores computados de la barra ===')
  const raw = await evaluate(ws, READ_COLORS, { awaitPromise: false })
  if (raw.error) throw new Error(raw.error)
  const colors = raw.value
  console.log(`  chip de Problemas      : ${colors.chip}`)
  for (const icon of colors.icons) console.log(`   · icono <${icon.tag}>      : ${icon.color}`)
  console.log(`  icono de ajustes (ref) : ${colors.settingsIcon}`)
  console.log(`  tema: texto=${colors.text} · danger=${colors.danger} · warning=${colors.warning}`)

  const unique = [...new Set(colors.icons.map((i) => i.color))]
  check('los dos iconos del chip se pintan del MISMO color', unique.length === 1, unique.join(' / '))
  check(
    'los iconos NO tienen color propio (heredan el del chip)',
    unique.length === 1 && unique[0] === colors.chip,
    `iconos=${unique.join(' / ')} chip=${colors.chip}`
  )
  check(
    'los iconos se ven como los otros iconos de la barra (ajustes)',
    unique[0] === colors.settingsIcon,
    `${unique[0]} vs ${colors.settingsIcon}`
  )
  // El tema puede definir danger/warning en hex: comparo contra rgb() resuelto.
  const resolved = await evaluate(
    ws,
    `(() => {
       const probe = document.createElement('div')
       document.body.appendChild(probe)
       const out = {}
       for (const key of ['--color-danger', '--color-warning']) {
         probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(key).trim()
         out[key] = getComputedStyle(probe).color
       }
       probe.remove()
       return out
     })()`,
    { awaitPromise: false }
  )
  const danger = resolved.value?.['--color-danger']
  const warning = resolved.value?.['--color-warning']
  check(
    'ningún icono queda pintado con el danger/warning del tema',
    unique.every((c) => c !== danger && c !== warning),
    `danger=${danger} warning=${warning}`
  )

  child.kill('SIGKILL')
  console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`[probe] ${error.message}`)
  try {
    child.kill('SIGKILL')
  } catch {
    // ya murió
  }
  process.exit(1)
})

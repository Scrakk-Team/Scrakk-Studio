/**
 * Probe: ¿el pintado de sintaxis es igual en el bundle (`electron .`) y en la
 * app EMPAQUETADA (asar)?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * El reporte es: "en prod la sintaxis se ve incompleta, con la mayoría de
 * lenguajes". La única diferencia real entre dev y la app instalada que puede
 * afectar el camino del color es el empaquetado (asar) y el esquema de URL.
 * Este probe abre el MISMO contenido en varios lenguajes y mide, por lenguaje,
 * cuántos píxeles del editor tienen color y cuántos son tinta.
 *
 *   npm run build
 *   node tools/_probe-syntax-prod.mjs --mode=electron
 *   node tools/_probe-syntax-prod.mjs --mode=packaged
 *
 * Deja las capturas en /tmp/innerta-shots/ para MIRARLAS.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng, isVivid } from './lib/png-read.mjs'

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const MODE = arg('mode', 'electron')
const PORT = Number(arg('port', MODE === 'packaged' ? 9341 : 9340))
const SHOTS = '/tmp/innerta-shots'
const PROFILE = join(process.cwd(), `release/_probe-syntax-${MODE}${arg('appcwd', '') ? '-altcwd' : ''}`)
/**
 * `devserver`: perfil LIMPIO + renderer servido por Vite. Aísla la última
 * variable que queda entre dev y prod: el renderer bundleado (minificado) vs
 * los módulos ESM que sirve el dev server. Todo lo demás (main, wasm, tema por
 * defecto) es el mismo.
 */
const DEV_SERVER = arg('devserver', '')
/**
 * cwd del PROCESO de la app. En una instalación real (AppImage, .desktop) NO es
 * la raíz del proyecto; es la única diferencia de entorno que dev vs prod
 * pueden tener y que el motor sí puede leer (rutas relativas).
 */
const APP_CWD = arg('appcwd', process.cwd())

/** Muestra por lenguaje: comentario, string, número, keyword y una función. */
const SAMPLES = {
  'ts|syntaxprobe-ts.ts': [
    '// Comentario de línea para ver el color de comentario',
    "/** Bloque de documentación: otro scope más */",
    "import { readFileSync } from 'node:fs'",
    '',
    'export interface Config {',
    '  name: string',
    '  retries: number',
    '}',
    '',
    'export function build(entries: Config[]): string {',
    "  const label = `entry: ${entries.length}`",
    '  return label + 42 + true + null',
    '}',
    ''
  ],
  'js|syntaxprobe-js.js': [
    '// Comentario de línea para ver el color de comentario',
    '/** Bloque de documentación: otro scope más */',
    "import { readFileSync } from 'node:fs'",
    '',
    'export const baseConfig = { name: \'scrakk\', retries: 3, strict: true }',
    '',
    'export function build(entries) {',
    "  const label = `entry: ${entries.length}`",
    '  return label + 42 + true + null',
    '}',
    ''
  ],
  'py|syntaxprobe-py.py': [
    '# Comentario de línea para ver el color de comentario',
    '"""Docstring de módulo"""',
    'import os',
    'from pathlib import Path',
    '',
    'class Config:',
    '    def __init__(self, name: str, retries: int = 3):',
    '        self.name = name',
    '        self.retries = retries',
    '',
    'def build(entries):',
    '    label = f"entry: {len(entries)}"',
    '    return label + str(42) + True + None',
    ''
  ],
  'rs|syntaxprobe-rs.rs': [
    '// Comentario de línea para ver el color de comentario',
    '/// Doc comment: otro scope más',
    'use std::path::Path;',
    '',
    'pub struct Config {',
    '    pub name: String,',
    '    pub retries: u32,',
    '}',
    '',
    'pub fn build(entries: &[Config]) -> String {',
    '    let label = format!("entry: {}", entries.len());',
    '    label + "42" + "true"',
    '}',
    ''
  ],
  'go|syntaxprobe-go.go': [
    '// Comentario de línea para ver el color de comentario',
    'package main',
    '',
    'import (',
    '    "fmt"',
    '    "strings"',
    ')',
    '',
    'type Config struct {',
    '    Name    string',
    '    Retries int',
    '}',
    '',
    'func Build(entries []Config) string {',
    '    label := fmt.Sprintf("entry: %d", len(entries))',
    '    return strings.ToUpper(label) + "42"',
    '}',
    ''
  ],
  'rb|syntaxprobe-rb.rb': [
    '# Comentario de línea para ver el color de comentario',
    'require "json"',
    '',
    'class Config',
    '  attr_reader :name, :retries',
    '',
    '  def initialize(name, retries = 3)',
    '    @name = name',
    '    @retries = retries',
    '  end',
    'end',
    '',
    'def build(entries)',
    '  label = "entry: #{entries.length}"',
    '  label + 42.to_s',
    'end',
    ''
  ],
  'sh|syntaxprobe-sh.sh': [
    '#!/usr/bin/env bash',
    '# Comentario de línea para ver el color de comentario',
    'set -euo pipefail',
    '',
    'NAME="scrakk"',
    'RETRIES=3',
    '',
    'build() {',
    '  local label="entry: $1"',
    '  echo "$label" >&2',
    '}',
    '',
    'build "$NAME"',
    ''
  ],
  'css|syntaxprobe-css.css': [
    '/* Comentario para ver el color de comentario */',
    ':root {',
    '  --bg: #0b0d10;',
    '  --accent: rgb(120, 200, 255);',
    '}',
    '',
    '.panel {',
    '  display: flex;',
    '  gap: 8px;',
    '  color: var(--accent);',
    '}',
    ''
  ],
  'html|syntaxprobe-html.html': [
    '<!DOCTYPE html>',
    '<!-- Comentario para ver el color de comentario -->',
    '<html lang="es">',
    '  <head>',
    '    <title>Probe</title>',
    '  </head>',
    '  <body class="page">',
    '    <h1 id="title">Hola</h1>',
    '  </body>',
    '</html>',
    ''
  ],
  'json|syntaxprobe-json.json': [
    '{',
    '  "name": "scrakk",',
    '  "retries": 3,',
    '  "strict": true,',
    '  "nested": { "array": [1, 2, 3] }',
    '}',
    ''
  ],
  'cpp|syntaxprobe-cpp.cpp': [
    '// Comentario de línea para ver el color de comentario',
    '#include <string>',
    '',
    'struct Config {',
    '  std::string name;',
    '  int retries;',
    '};',
    '',
    'std::string build(int n) {',
    '  const char* label = "entry";',
    '  return std::string(label) + std::to_string(42 + n);',
    '}',
    ''
  ]
}

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

function send(sock, method, params) {
  const id = nextId++
  sock.send(JSON.stringify({ id, method, params }))
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

function measure(image) {
  if (!image) return null
  let vivid = 0
  let ink = 0
  const hues = new Set()
  for (let i = 0; i < image.width * image.height * 4; i += 4) {
    const r = image.data[i]
    const g = image.data[i + 1]
    const b = image.data[i + 2]
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
  return opened.value?.clicked === true
}

function launch() {
  // `dev`: NO se lanza nada: se engancha a un `electron-vite dev` ya corriendo
  // (con `--remoteDebuggingPort`). Es la única forma de medir con el perfil y el
  // storage REALES que usa el usuario en dev (origen http://localhost:7080).
  if (MODE === 'dev') return null
  if (MODE === 'packaged') {
    const binary = join(process.cwd(), 'release/linux-unpacked/scrakk-studio')
    if (!existsSync(binary)) throw new Error(`no encuentro el binario empaquetado en ${binary}`)
    return spawn(binary, [`--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
      cwd: APP_CWD,
      stdio: 'ignore',
      detached: false
    })
  }
  const electron = join(process.cwd(), 'node_modules/electron/dist/electron')
  if (!existsSync(electron)) throw new Error(`no encuentro electron en ${electron}`)
  const env = DEV_SERVER ? { ...process.env, ELECTRON_RENDERER_URL: DEV_SERVER } : process.env
  return spawn(electron, ['.', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: APP_CWD,
    env,
    stdio: 'ignore',
    detached: false
  })
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true })
  mkdirSync(PROFILE, { recursive: true })
  mkdirSync(SHOTS, { recursive: true })
  const files = []
  for (const [key, lines] of Object.entries(SAMPLES)) {
    const [kind, name] = key.split('|')
    writeFileSync(join(process.cwd(), name), lines.join('\n'))
    files.push({ kind, name })
  }

  console.log(`modo: ${MODE} · cwd de la app: ${APP_CWD} · perfil: ${PROFILE} · puerto: ${PORT}\n`)
  const child = launch()
  if (child) process.on('exit', () => child.kill())

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
    }
  })
  void send(ws, 'Runtime.enable', {})

  for (let i = 0; i < 40; i++) {
    const ready = await evaluate(`document.readyState === 'complete' && !!window.api?.screenshot`, {
      awaitPromise: false
    })
    if (ready.value === true) break
    await wait(1000)
  }

  // Perfil limpio: onboarding afuera y la raíz del explorador en cwd.
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
  await wait(6000)
  await wait(8000)

  await runPaletteCommand('explorador', '/explorador/i')
  await wait(3000)

  const results = {}
  for (const { kind, name } of files) {
    const before = logs.length
    const opened = await openFromExplorer(name)
    await wait(6000)
    const shot = await captureEditor(`syntax-${MODE}-${kind}`)
    const image = (() => {
      try {
        return shot?.path ? decodePng(readFileSync(shot.path)) : null
      } catch {
        return null
      }
    })()
    const data = measure(image)
    const engineLogs = logs.slice(before).filter((l) => /SyntaxHighlighter|TreeSitter|grammar/i.test(l))
    results[kind] = { opened, ...(data ?? {}) }
    console.log(
      `${opened ? '✓' : '✗'} ${kind.padEnd(5)} abierto=${opened} · color ${String(data?.vivid ?? '?').padStart(6)} · tinta ${String(data?.ink ?? '?').padStart(6)} · matices ${data?.hues ?? '?'}`
    )
    for (const line of [...new Set(engineLogs)].slice(0, 6)) console.log(`     · ${line}`)
  }

  console.log('\n=== resumen ===')
  console.log(`modo ${MODE} · cwd ${APP_CWD}`)
  for (const [kind, data] of Object.entries(results)) {
    const ratio = data.ink ? Math.round((data.vivid / data.ink) * 100) : 0
    console.log(`  ${kind.padEnd(5)} color=${String(data.vivid ?? 0).padStart(6)} tinta=${String(data.ink ?? 0).padStart(6)} (${ratio}% de la tinta tiene color)`)
  }
  console.log('\ncapturas en ' + SHOTS)
  child?.kill()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

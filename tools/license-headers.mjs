#!/usr/bin/env node
/**
 * Agrega el header de licencia Apache-2.0 a los archivos del repo.
 *
 * Reglas (pensadas para NO corromper nada):
 *  - Solo toca archivos RASTREADOS por git (nada de node_modules/out/dist).
 *  - Solo extensiones con sintaxis de comentario conocida. JSON se SALTA
 *    (no admite comentarios) y MD/binarios también.
 *  - Lista negra de rutas: código de terceros y artefactos generados.
 *  - Si el archivo ya tiene el SPDX, no lo toca (idempotente).
 *  - Respeta el shebang: el header va DESPUÉS de la primera línea si es `#!`.
 *  - Usa el fin de línea dominante del archivo (LF/CRLF).
 *
 * Uso:  node tools/license-headers.mjs [--dry]
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const DRY = process.argv.includes('--dry')

const HOLDER = 'Copyright 2026 Scrakk Studio'
const SPDX = 'SPDX-License-Identifier: Apache-2.0'
const NOTICE = 'Licencia completa en LICENSE (Apache License 2.0).'
const LINES = [HOLDER, SPDX, NOTICE]

/** Estilo de comentario por extensión/archivo. */
const LINE_SLASH = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'rs', 'c', 'cc', 'cpp', 'cxx',
  'h', 'hpp', 'hh', 'java', 'go', 'swift', 'kt', 'kts', 'scala', 'dart', 'cs', 'php'
])
const LINE_HASH = new Set([
  'sh', 'bash', 'zsh', 'yml', 'yaml', 'toml', 'py', 'rb', 'pl', 'r', 'ps1', 'mk'
])
const LINE_SQL = new Set(['sql'])
const BLOCK = new Set(['css', 'scss', 'less'])
const HTML = new Set(['html', 'htm', 'xhtml'])

/** Nunca se tocan (comentarios imposibles o archivos que no son nuestros). */
const SKIP_EXT = new Set([
  'json', 'md', 'lock', 'txt', 'ttf', 'otf', 'woff', 'woff2', 'png', 'jpg',
  'jpeg', 'gif', 'svg', 'ico', 'wasm', 'map', 'snap', 'log', 'patch', 'diff'
])
const SKIP_PREFIX = [
  'native/kolargrep/', // código de terceros: tiene su propio LICENSE
  'files-otherapps/',
  'langs/', // pack generado
  'src/renderer/public/innerta/', // wasm/glue generadas
  'src/renderer/public/fonts/' // fuentes con su propia licencia
]
const SKIP_NAME = new Set(['Makefile', 'makefile', 'GNUmakefile'])

/** Header para un estilo dado, con el EOL del archivo. */
function headerFor(style, eol) {
  if (style === 'block') {
    return ['/*', ...LINES.map((l) => ` * ${l}`), ' */', ''].join(eol) + eol
  }
  if (style === 'html') {
    return ['<!--', ...LINES.map((l) => `  ${l}`), '-->', ''].join(eol) + eol
  }
  const mark = style === 'hash' ? '#' : style === 'sql' ? '--' : '//'
  return LINES.map((l) => `${mark} ${l}`).join(eol) + eol + eol
}

function styleOf(file) {
  const base = path.basename(file)
  if (SKIP_NAME.has(base)) return 'hash' // Makefile: `#`
  const ext = path.extname(base).slice(1).toLowerCase()
  if (SKIP_EXT.has(ext)) return null
  if (LINE_SLASH.has(ext)) return 'slash'
  if (LINE_HASH.has(ext)) return 'hash'
  if (LINE_SQL.has(ext)) return 'sql'
  if (BLOCK.has(ext)) return 'block'
  if (HTML.has(ext)) return 'html'
  // Sin extensión pero con shebang: se decide por el intérprete.
  return null
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  return out
    .toString('utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function dominantEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

let changed = 0
let skipped = 0
const byStyle = {}

for (const file of trackedFiles()) {
  if (SKIP_PREFIX.some((p) => file.startsWith(p))) {
    skipped++
    continue
  }
  let style = styleOf(file)
  if (!style) {
    // Scripts sin extensión: miran el shebang.
    if (file === 'native/kolargrep/scripts/hooks/pre-commit') {
      skipped++
      continue
    }
    skipped++
    continue
  }

  const abs = path.join(ROOT, file)
  let text
  try {
    text = fs.readFileSync(abs, 'utf8')
  } catch {
    skipped++
    continue
  }
  if (text.includes(SPDX)) {
    skipped++
    continue
  }
  // Un archivo con NUL es binario: no se toca.
  if (text.includes('\u0000')) {
    skipped++
    continue
  }

  const eol = dominantEol(text)
  const marker = style
  const header = headerFor(marker, eol)

  // Después del shebang, si lo hay.
  let insertAt = 0
  // Un BOM UTF-8 tiene que seguir siendo el PRIMER byte.
  if (text.charCodeAt(0) === 0xfeff) insertAt = 1
  if (text.slice(insertAt).startsWith('#!')) {
    const nl = text.indexOf('\n', insertAt)
    insertAt = nl === -1 ? text.length : nl + 1
  }
  const next = text.slice(0, insertAt) + header + text.slice(insertAt)

  byStyle[style] = (byStyle[style] ?? 0) + 1
  if (!DRY) fs.writeFileSync(abs, next)
  changed++
}

console.log(`${DRY ? '[dry] ' : ''}archivos con header agregado: ${changed}`)
console.log(`sin tocar: ${skipped}`)
console.log('por estilo:', JSON.stringify(byStyle))

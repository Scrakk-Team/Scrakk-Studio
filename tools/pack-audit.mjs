#!/usr/bin/env node
// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * pack-audit — audita el artefacto empaquetado (app.asar) buscando filtraciones.
 *
 * Chequea que el paquete NO contenga:
 *   - sourcemaps (*.map) → revelan el código fuente completo.
 *   - fuentes/TS del proyecto, docs/ (incluye el SQL del backend), tests/, tools/, native/.
 *   - .env / .dev.vars ni strings de secretos (service_role, APP_SECRET, …).
 *
 * Uso:
 *   node tools/pack-audit.mjs [ruta/app.asar]     (default: primer app.asar en release/)
 * Sale con código 1 si encuentra algo GRAVE.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** scope 'app' = solo fuera de node_modules; 'any' = en cualquier lado. */
const FORBIDDEN_PATHS = [
  { re: /\.map$/i, why: 'sourcemap (código fuente)', scope: 'any' },
  { re: /(^|\/)\.env(\.|$)/i, why: 'archivo .env', scope: 'any' },
  { re: /\.dev\.vars/i, why: '.dev.vars (secretos dev)', scope: 'any' },
  { re: /(^|\/)\.git\//i, why: 'repo git', scope: 'any' },
  { re: /tauri/i, why: 'copia Tauri', scope: 'any' },
  { re: /^docs\//i, why: 'docs (SQL del backend)', scope: 'app' },
  { re: /^tests\//i, why: 'tests', scope: 'app' },
  { re: /^tools\//i, why: 'tools del repo', scope: 'app' },
  { re: /^native\//i, why: 'fuentes nativas', scope: 'app' },
  { re: /^files-otherapps\//i, why: 'código de otras apps', scope: 'app' },
  { re: /\.tsx?$/i, why: 'fuente TypeScript', scope: 'app' }
]

const FORBIDDEN_CONTENT = [
  { re: /service_role/i, why: 'service_role key' },
  { re: /SUPABASE_SERVICE_ROLE/i, why: 'SUPABASE_SERVICE_ROLE_KEY' },
  { re: /PAYPAL_CLIENT_SECRET/i, why: 'PayPal secret' },
  { re: /DEEPSEEK_API_KEY/, why: 'DeepSeek key' },
  { re: /RESEND_API_KEY/, why: 'Resend key' },
  { re: /TURNSTILE_SECRET_KEY/, why: 'Turnstile secret' },
  { re: /APP_SECRET/, why: 'APP_SECRET del server' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'clave privada' },
  { re: /sk_live_[A-Za-z0-9]/, why: 'Stripe live key' }
]

function findAsar(dir) {
  const found = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }
  for (const name of entries) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) found.push(...findAsar(full))
    else if (name === 'app.asar') found.push(full)
  }
  return found
}

const asar = await import('@electron/asar')
const api = asar.default ?? asar

const target = process.argv[2] ?? findAsar(join(ROOT, 'release'))[0]
if (!target) {
  console.error('✖ No encontré app.asar. Corré `npm run dist:dir` primero.')
  process.exit(1)
}

console.log(`\n🔎 Auditando ${relative(ROOT, target)}\n`)

/** Entradas del asar tal cual (con '/' inicial). */
const raw = api.listPackage(target)
/** Normalizadas (sin '/' inicial) para matchear. */
const files = raw.map((p) => p.replace(/^[\\/]+/, ''))

let failures = 0
let warns = 0

// 1) Rutas prohibidas
for (let i = 0; i < files.length; i++) {
  const path = files[i]
  const isApp = !path.startsWith('node_modules/')
  for (const rule of FORBIDDEN_PATHS) {
    if (rule.scope === 'app' && !isApp) continue
    if (rule.re.test(path)) {
      console.error(`✖ RUTA PROHIBIDA: ${path}  → ${rule.why}`)
      failures++
    }
  }
  if (isApp && /\.tsx?$/i.test(path) && /\.d\.ts$/i.test(path)) {
    // .d.ts dentro de la app: no es fuente real, pero avisamos.
    warns++
  }
}

// 2) Contenido prohibido (solo texto)
const TEXT_EXT = /\.(js|mjs|cjs|json|html|css|txt)$/i
let scanned = 0
for (let i = 0; i < files.length; i++) {
  if (!TEXT_EXT.test(files[i])) continue
  let buf
  try {
    buf = api.extractFile(target, files[i])
  } catch {
    continue
  }
  const text = buf.toString('utf8')
  scanned++
  const isApp = files[i].startsWith('out/') || files[i] === 'package.json'
  for (const rule of FORBIDDEN_CONTENT) {
    if (!rule.re.test(text)) continue
    if (isApp) {
      console.error(`✖ SECRETO en ${files[i]}  → ${rule.why}`)
      failures++
    } else {
      // node_modules puede MENCIONAR el término (tipos/comentarios), no es una clave.
      console.warn(`⚠ mención de "${rule.why}" en ${files[i]} (lib externa, no es clave)`)
      warns++
    }
  }
}

// 3) Resumen
const roots = [...new Set(files.map((p) => p.split('/')[0]))].sort()
console.log(`\nEntradas: ${files.length} | textos escaneados: ${scanned} | avisos: ${warns}`)
console.log(`Raíces: ${roots.join(', ')}`)
console.log(
  `Incluye node_modules/@supabase: ${files.some((p) => p.startsWith('node_modules/@supabase')) ? 'sí' : 'no'}`
)
console.log(`Incluye out/: ${files.some((p) => p.startsWith('out/')) ? 'sí' : 'no'}`)

if (failures > 0) {
  console.error(`\n❌ ${failures} problema(s). Revisá electron-builder.yml (files) y el build.\n`)
  process.exit(1)
}
console.log('\n✅ Paquete limpio: sin maps, sin fuentes, sin docs, sin secretos.\n')

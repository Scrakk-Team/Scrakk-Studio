// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Carga `.env` local al `process.env` (sin dependencias).
 *
 * Orden: lo que ya viene en el entorno gana; después userData/.env
 * (producción); después el .env de la raíz del proyecto (dev).
 * Solo asigna claves ausentes — nunca pisa el entorno real.
 */

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = value
  }
  return out
}

/** Lee los .env candidatos y completa las vars ausentes. Devuelve cuántas cargó. */
export function loadLocalEnv(): number {
  let loaded = 0
  const candidates: string[] = []
  try {
    candidates.push(join(app.getPath('userData'), '.env'))
  } catch {
    /* app no listo: se llama igual en whenReady */
  }
  // En un build ENTREGADO no se lee el `.env` del directorio de trabajo: un
  // archivo colocado junto al AppImage/`scrakk` podía inyectar
  // `SCRAKK_API_BASE`, `SCRAKK_SUPABASE_URL`, `LD_PRELOAD`, etc. En dev sí
  // (es la forma de configurar el repo).
  if (!app.isPackaged) candidates.push(join(process.cwd(), '.env'))
  for (const file of candidates) {
    let text: string
    try {
      if (!existsSync(file)) continue
      text = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    for (const [key, value] of Object.entries(parseEnv(text))) {
      if (process.env[key] === undefined) {
        process.env[key] = value
        loaded++
      }
    }
  }
  return loaded
}

/**
 * Entorno para procesos hijos (terminal, LSP, extensiones, instaladores).
 *
 * El main carga secretos en `process.env` (R2, tokens de GitHub/GitLab,
 * Supabase). Heredarlos a un PTY o a una extensión de terceros es exfiltración
 * directa. Se filtran las variables sensibles y los hooks de ejecución
 * (`LD_PRELOAD`, `NODE_OPTIONS`, `GIT_SSH_COMMAND`).
 */
const SENSITIVE_CHILD_ENV =
  /(^SCRAKK_R2_(ACCESS_KEY|SECRET_KEY)$|^SCRAKK_.*_(TOKEN|SECRET|KEY|PASSWORD)$|SERVICE_ROLE_KEY|^LD_PRELOAD$|^NODE_OPTIONS$|^GIT_SSH_COMMAND$)/i

export function childEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    if (SENSITIVE_CHILD_ENV.test(key)) continue
    out[key] = value
  }
  return out
}

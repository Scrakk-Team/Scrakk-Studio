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
  candidates.push(join(process.cwd(), '.env'))
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

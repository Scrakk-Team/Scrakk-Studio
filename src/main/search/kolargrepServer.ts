// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sidecar de búsqueda: `kolargrep serve` + JSON-RPC por TCP.
 *
 * KolarGrep es un motor de indexado con servidor propio (índice de trigramas
 * vivo, watcher, caché, publicación atómica). En vez de reimplementar eso en el
 * addon NAPI, se lanza su servidor una vez por workspace y se le habla el
 * protocolo: un objeto JSON por línea, métodos `search`, `files`, `status` y
 * `reload`.
 *
 * El servidor escribe `<indexDir>/serve.json` (PID + puerto). Se usa un
 * `--index-path` FUERA del proyecto para no ensuciar el repo (el default del CLI
 * es `./.kolargrep`).
 *
 * Todo es best-effort: si el binario no está o el server no arranca, se devuelve
 * null y el caller cae al addon nativo / scan en TS.
 */
import { spawn, type ChildProcess } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'

const BIN = 'kolargrep'
/** Servidores vivos por root. Se matan al salir la app. */
const servers = new Map<string, ChildProcess>()

function binaryName(): string {
  return process.platform === 'win32' ? `${BIN}.exe` : BIN
}

/**
 * Rutas candidatas del binario: recursos empaquetados, al lado del main y el
 * checkout de desarrollo (`native/kolargrep/target/release`).
 */
function binaryCandidates(): string[] {
  const exe = binaryName()
  const here = __dirname
  const unpacked = here.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  return [
    path.join(process.resourcesPath ?? '', exe),
    path.join(unpacked, exe),
    path.join(here, exe),
    path.join(here, '../../native/kolargrep/target/release', exe),
    path.join(process.cwd(), 'native/kolargrep/target/release', exe)
  ]
}

let cachedBinary: string | null | undefined
export function findKolargrepBinary(): string | null {
  if (cachedBinary !== undefined) return cachedBinary
  for (const candidate of binaryCandidates()) {
    try {
      if (fs.existsSync(candidate)) {
        cachedBinary = candidate
        return candidate
      }
    } catch {
      // sigue con la próxima
    }
  }
  cachedBinary = null
  return null
}

/** Índice del sidecar: cache del usuario, fuera del proyecto. */
function indexDirFor(root: string): string {
  const hash = crypto.createHash('sha256').update(root).digest('hex').slice(0, 16)
  const base = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache')
  return path.join(base, 'scrakk-search-serve', hash)
}

interface ServeInfo {
  pid: number
  port: number
}

function readServeInfo(indexDir: string): ServeInfo | null {
  try {
    const raw = fs.readFileSync(path.join(indexDir, 'serve.json'), 'utf8')
    const parsed = JSON.parse(raw) as ServeInfo
    return typeof parsed?.port === 'number' ? parsed : null
  } catch {
    return null
  }
}

/** Una request JSON-RPC de una línea; devuelve el `result` o null. */
function rpc(indexDir: string, method: string, params: unknown, timeoutMs = 15000): Promise<unknown> {
  return new Promise((resolve) => {
    const info = readServeInfo(indexDir)
    if (!info) return resolve(null)

    const socket = net.connect({ host: '127.0.0.1', port: info.port })
    let buffer = ''
    let settled = false
    const done = (value: unknown): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => done(null))
    socket.on('error', () => done(null))
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })}\n`)
    })
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const nl = buffer.indexOf('\n')
      if (nl < 0) return
      try {
        const message = JSON.parse(buffer.slice(0, nl)) as { result?: unknown }
        done(message.result ?? null)
      } catch {
        done(null)
      }
    })
  })
}

/** Arranca (una vez) el servidor para `root` y espera su `serve.json`. */
export async function ensureKolargrepServer(root: string): Promise<boolean> {
  if (!root) return false
  const indexDir = indexDirFor(root)
  if (readServeInfo(indexDir)) return true
  if (servers.has(root)) return false

  const bin = findKolargrepBinary()
  if (!bin) return false

  try {
    fs.mkdirSync(indexDir, { recursive: true })
    const child = spawn(bin, ['serve', root, '--index-path', indexDir], {
      cwd: root,
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
    servers.set(root, child)
    console.log(`[kolargrep] serve ${root} (pid ${child.pid ?? '?'}, índice ${indexDir})`)
  } catch (error) {
    console.warn(`[kolargrep] no se pudo lanzar el server: ${(error as Error).message}`)
    return false
  }

  // El server publica serve.json cuando ya escucha. Se espera con backoff corto.
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (readServeInfo(indexDir)) return true
  }
  console.warn('[kolargrep] el server no publicó serve.json a tiempo')
  return false
}

export interface SidecarMatch {
  file: string
  line: number
  content: string
  preview: string
  columns?: number[]
  spans?: Array<[number, number]>
}

/**
 * Grep por el sidecar. Misma forma que el addon más `columns`/`spans` (los
 * offsets por match, que es lo que el editor necesita para resaltar).
 */
export async function sidecarGrep(
  root: string,
  pattern: string,
  caseSensitive: boolean,
  maxResults: number
): Promise<SidecarMatch[] | null> {
  if (!(await ensureKolargrepServer(root))) return null
  const result = (await rpc(indexDirFor(root), 'search', {
    pattern,
    case_insensitive: !caseSensitive,
    max_count: maxResults,
    detail: true,
    positions: true
  })) as { matches?: Array<Record<string, unknown>> } | null
  if (!result || !Array.isArray(result.matches)) return null

  return result.matches
    .filter((row) => row.type === 'match')
    .map((row) => {
      const content = String(row.content ?? '').replace(/\r?\n$/, '')
      return {
        file: String(row.file ?? ''),
        line: Number(row.line ?? 0),
        content,
        preview: content.slice(0, 200),
        ...(Array.isArray(row.columns) ? { columns: row.columns as number[] } : {}),
        ...(Array.isArray(row.spans) ? { spans: row.spans as Array<[number, number]> } : {})
      }
    })
}

/** Estado del índice/servidor (files, bytes, fase de indexado…). */
export async function sidecarStatus(root: string): Promise<unknown> {
  if (!(await ensureKolargrepServer(root))) return null
  return rpc(indexDirFor(root), 'status', {})
}

/** Mata los servidores lanzados por esta app (al salir). */
export function stopKolargrepServers(): void {
  for (const child of servers.values()) {
    try {
      if (child.pid) process.kill(child.pid, 'SIGTERM')
    } catch {
      // ya estaba muerto
    }
  }
  servers.clear()
}

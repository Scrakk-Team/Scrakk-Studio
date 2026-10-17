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
import { kolargrepDirs } from './nativePaths'

const BIN = 'kolargrep'
/** Servidores vivos por root. Se matan al salir la app. */
const servers = new Map<string, ChildProcess>()
/** Último uso por root, para el apagado por inactividad. */
const lastUsed = new Map<string, number>()
const idleTimers = new Map<string, NodeJS.Timeout>()

/**
 * Apagado por inactividad del sidecar: si no hay búsquedas durante este tiempo,
 * se apaga y libera su RAM. El ÍNDICE queda en disco, así la próxima búsqueda
 * reusa lo ya construido (re-arranca rápido).
 *
 * Override con `SCRAKK_SEARCH_IDLE_MS` (ms; 0 = desactivado).
 */
function idleShutdownMs(): number {
  const raw = process.env.SCRAKK_SEARCH_IDLE_MS
  if (raw === undefined) return 5 * 60_000
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5 * 60_000
}

/** ¿Sigue vivo el proceso del sidecar? (`serve.json` puede quedar viejo). */
function isProcessAlive(pid: number): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Apaga el server de un root y limpia `serve.json` (así la próxima revive). */
function stopServer(root: string): void {
  const timer = idleTimers.get(root)
  if (timer) {
    clearTimeout(timer)
    idleTimers.delete(root)
  }
  lastUsed.delete(root)
  const child = servers.get(root)
  servers.delete(root)
  if (child?.pid) {
    try {
      process.kill(child.pid, 'SIGTERM')
    } catch {
      // ya estaba muerto
    }
  }
  try {
    fs.rmSync(path.join(indexDirFor(root), 'serve.json'), { force: true })
  } catch {
    // nada que limpiar
  }
}

/** Marca actividad de un root y reprograma su apagado por inactividad. */
function touch(root: string): void {
  lastUsed.set(root, Date.now())
  const existing = idleTimers.get(root)
  if (existing) clearTimeout(existing)
  const ms = idleShutdownMs()
  if (ms <= 0) return
  const timer = setTimeout(() => stopServer(root), ms)
  if (typeof timer.unref === 'function') timer.unref()
  idleTimers.set(root, timer)
}

function binaryName(): string {
  return process.platform === 'win32' ? `${BIN}.exe` : BIN
}

/**
 * Rutas candidatas del binario: recursos empaquetados, al lado del main y el
 * checkout de desarrollo (`native/kolargrep/target/release`).
 */
function binaryCandidates(): string[] {
  const exe = binaryName()
  // Sin `process.cwd()`: si el IDE se arranca desde un repo, un binario
  // plantado ahí se ejecutaría como proceso hijo. Ver nativePaths.ts.
  return kolargrepDirs(__dirname, process.resourcesPath).map((dir) => path.join(dir, exe))
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
  const info = readServeInfo(indexDir)
  if (info && isProcessAlive(info.pid)) return true
  if (info) {
    // `serve.json` viejo (el proceso murió): limpiarlo para respawnear.
    try {
      fs.rmSync(path.join(indexDir, 'serve.json'), { force: true })
    } catch {
      // nada que limpiar
    }
  }
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
  touch(root)
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
  touch(root)
  return rpc(indexDirFor(root), 'status', {})
}

/** Mata los servidores lanzados por esta app (al salir). */
export function stopKolargrepServers(): void {
  for (const timer of idleTimers.values()) clearTimeout(timer)
  idleTimers.clear()
  lastUsed.clear()
  for (const child of servers.values()) {
    try {
      if (child.pid) process.kill(child.pid, 'SIGTERM')
    } catch {
      // ya estaba muerto
    }
  }
  servers.clear()
}

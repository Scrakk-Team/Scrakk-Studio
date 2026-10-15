// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Manager del worker de tree-sitter DINÁMICO (lado main).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY UN MANAGER Y NO UN `import` DIRECTO
 *
 * Porque el parser es un `.wasm` de terceros: se ejecuta en un proceso aparte,
 * se le pone timeout, y si se cuelga se MATA el proceso y el editor sigue
 * pintando con lo que tenía. Un parser colgado dentro del main, en cambio, se
 * lleva la ventana entera.
 *
 * El proceso se levanta la PRIMERA vez que un lenguaje dinámico lo necesita y
 * se apaga solo tras un rato sin uso: la mayoría de las sesiones nunca abre un
 * lenguaje así y no tiene por qué cargar con un proceso vivo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE VERIFICA ANTES DE MANDARLE NADA
 *
 * 1. Que el parser y las queries estén DENTRO del directorio de extensiones
 *    (las rutas vienen del manifest de un paquete de terceros).
 * 2. Que el sha256 coincida cuando el paquete lo declara: un `.wasm` es código
 *    ejecutable, y comparar el hash es lo que convierte "confío en el paquete
 *    que instalé" en algo verificable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * `spawnWorker` es la costura: hoy usa `utilityProcess.fork`. El resto (cola,
 * timeout, verificación de hash, apagado por inactividad) no cambia.
 */

import { utilityProcess, type UtilityProcess } from 'electron'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'

import type { DynamicTokenizeRequest, DynamicTokenizeResult } from '@shared/extensions'
import { assertGrammarPathAllowed } from '../tokenize'
import { resolveSpawnEntry } from '../../spawnEntry'

/** Cuánto se espera a un tokenizado antes de dar el worker por colgado. */
export const REQUEST_TIMEOUT_MS = 10_000
/**
 * Timeout del PRIMER pedido tras levantar el proceso (arranque en frío). Más
 * generoso: spawn + cargar el runtime wasm + el grammar + las queries puede
 * tardar mucho en un equipo lento (antivirus, disco frío) y matarlo ahí dejaba
 * el archivo sin color.
 */
export const FIRST_REQUEST_TIMEOUT_MS = 25_000
/** Sin pedidos por este tiempo, el proceso se apaga (se vuelve a levantar solo). */
export const IDLE_SHUTDOWN_MS = 60_000

export interface TreeSitterManagerOptions {
  /** Cómo se levanta el proceso (por defecto `utilityProcess.fork`). */
  spawn?: TreeSitterSpawner
  /** Timeout por pedido (los tests lo bajan para no esperar 10 s). */
  requestTimeoutMs?: number
  /**
   * Timeout del PRIMER pedido después de levantar el proceso: el arranque en
   * frío (spawn + cargar web-tree-sitter.wasm + el grammar + las queries) puede
   * tardar mucho más que un pedido normal. Default: `FIRST_REQUEST_TIMEOUT_MS`.
   */
  firstRequestTimeoutMs?: number
  /** Apagado por inactividad. */
  idleShutdownMs?: number
}

interface PendingRequest {
  resolve: (value: DynamicTokenizeResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  startedAt: number
}

/** Lo mínimo de un proceso hijo que usa el manager (inyectable en tests). */
export interface TreeSitterWorkerLike {
  postMessage(message: unknown): void
  on(event: 'message', listener: (message: unknown) => void): void
  on(event: 'exit', listener: (code: number) => void): void
  kill(): void
  /**
   * Resuelve cuando el proceso está LISTO para recibir mensajes. Sin esto, el
   * primer `postMessage` puede salir antes de que el hijo exista y perderse
   * (el pedido después muere por timeout): el "a veces no pinta". Opcional —
   * los spawners de test no lo implementan y se postea directo.
   */
  whenReady?(): Promise<void>
}

/** Manejador de procesos: se inyecta en tests para no levantar procesos reales. */
export type TreeSitterSpawner = (entryPath: string) => TreeSitterWorkerLike

/**
 * Ruta del bundle del worker en disco (lo emite electron-vite).
 *
 * Empaquetado se resuelve en `app.asar.unpacked`: este worker LEE los `.wasm` y
 * los `.scm` de las gramáticas de las extensiones, y una ruta virtual dentro del
 * asar no siempre se puede ejecutar como script (SELinux, noexec…). Si el worker
 * no arranca, ningún `.scm` se carga y el resaltado queda incompleto — sin
 * ningún error a la vista.
 */
export function workerEntryPath(): string {
  return resolveSpawnEntry('tree-sitter-worker.js')
}

function defaultSpawn(entryPath: string): TreeSitterWorkerLike {
  const child: UtilityProcess = utilityProcess.fork(entryPath, [], {
    serviceName: 'tree-sitter-dynamic',
    // El stderr del worker es la ÚNICA pista cuando "no pinta": sin `pipe` se
    // pierde (errores de wasm, queries que no compilan, ABI).
    stdio: 'pipe'
  })

  // Listo para recibir mensajes = evento `spawn`. También se resuelve en `exit`
  // para no colgar el `await` si el proceso murió antes de arrancar.
  const ready = new Promise<void>((resolve) => {
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    child.on('spawn', done)
    child.on('exit', done)
  })

  // Diagnóstico: se reenvía el stderr (prefijado) y se guarda la cola para
  // reportarla si el proceso sale.
  let stderrTail = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    stderrTail = (stderrTail + text).slice(-2000)
    for (const line of text.split('\n')) {
      if (line.trim()) console.warn(`[tree-sitter] ${line}`)
    }
  })
  child.on('exit', (code: number) => {
    if (stderrTail.trim()) {
      console.warn(
        `[tree-sitter] el worker salió (código ${code}); último stderr:\n${stderrTail.trim()}`
      )
    }
  })

  return {
    postMessage: (message) => child.postMessage(message),
    on: (event, listener) => {
      if (event === 'message') {
        const target = listener as (message: unknown) => void
        child.on('message', (message: unknown) => target(message))
      } else {
        const target = listener as (code: number) => void
        child.on('exit', (code: number) => target(code))
      }
    },
    kill: () => child.kill(),
    whenReady: () => ready
  }
}

export class TreeSitterManager {
  private worker: TreeSitterWorkerLike | null = null
  private pending = new Map<number, PendingRequest>()
  private nextId = 1
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly spawn: TreeSitterSpawner
  private readonly requestTimeoutMs: number
  private readonly firstRequestTimeoutMs: number
  private readonly idleShutdownMs: number
  /** El worker actual todavía no respondió NADA: su primer pedido es en frío. */
  private cold = true

  constructor(options: TreeSitterManagerOptions = {}) {
    this.spawn = options.spawn ?? defaultSpawn
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS
    this.firstRequestTimeoutMs = options.firstRequestTimeoutMs ?? FIRST_REQUEST_TIMEOUT_MS
    this.idleShutdownMs = options.idleShutdownMs ?? IDLE_SHUTDOWN_MS
  }

  /** ¿Hay un worker vivo? (tests y diagnóstico) */
  isRunning(): boolean {
    return this.worker !== null
  }

  private ensureWorker(): TreeSitterWorkerLike {
    if (this.worker) return this.worker
    const worker = this.spawn(workerEntryPath())
    worker.on('message', (message: unknown) => this.onMessage(message))
    worker.on('exit', (code: number) => this.onExit(code))
    this.worker = worker
    // Proceso nuevo: su primer pedido cuenta como frío (margen más largo).
    this.cold = true
    return worker
  }

  /**
   * El worker murió: se rechaza TODO lo pendiente.
   *
   * Sin esto, cada petición en vuelo quedaba esperando su timeout completo y el
   * usuario veía 10 s de "cargando" después de una caída.
   */
  private onExit(code: number): void {
    const error = new Error(`el worker de tree-sitter terminó (código ${code})`)
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.worker = null
    // El próximo worker arranca en frío otra vez.
    this.cold = true
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  private onMessage(message: unknown): void {
    const response = message as { id?: number; ok?: boolean; result?: DynamicTokenizeResult; error?: string }
    if (typeof response?.id !== 'number') return
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    clearTimeout(pending.timer)
    if (response.ok && response.result) {
      // Respondió: el worker ya está caliente (los próximos usan el timeout normal).
      this.cold = false
      pending.resolve(response.result)
    } else {
      pending.reject(new Error(response.error ?? 'tokenizado dinámico falló'))
    }
    this.scheduleIdleShutdown()
  }

  private scheduleIdleShutdown(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.pending.size > 0) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      this.stop()
    }, this.idleShutdownMs)
  }

  /**
   * Mata el worker. Las peticiones en vuelo se rechazan vía `onExit`, así que
   * no hay que resolverlas a mano aquí.
   */
  stop(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    const worker = this.worker
    this.worker = null
    worker?.kill()
  }

  /**
   * Verifica las rutas y el hash declarado.
   *
   * Es lo que separa "cargar un wasm que vino de un paquete de terceros" de
   * "ejecutar código arbitrario": el parser tiene que estar en el directorio de
   * extensiones, y si el paquete publica un sha256, tiene que coincidir.
   */
  private async verifyPaths(request: DynamicTokenizeRequest): Promise<void> {
    await assertGrammarPathAllowed(request.parserPath)
    for (const query of request.queries) {
      await assertGrammarPathAllowed(query.file)
    }
    await this.verifyHash(request.parserPath, request.sha256, request.languageId)

    // Los parsers EMBEBIDOS son .wasm de terceros igual que el de la raíz: un
    // `injections.scm` puede nombrar cualquier lenguaje, así que se verifican
    // uno por uno antes de que el worker cargue nada.
    for (const embedded of request.embedded ?? []) {
      await assertGrammarPathAllowed(embedded.parserPath)
      for (const query of embedded.queries) {
        await assertGrammarPathAllowed(query.file)
      }
      await this.verifyHash(embedded.parserPath, embedded.sha256, embedded.languageId)
    }
  }

  /** El hash declarado por el paquete, si lo hay, tiene que coincidir. */
  private async verifyHash(
    file: string,
    expected: string | undefined,
    languageId: string
  ): Promise<void> {
    if (!expected) return
    const digest = createHash('sha256').update(await fs.readFile(file)).digest('hex')
    if (digest.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(
        `sha256 del parser no coincide (${languageId}): esperado ${expected}, real ${digest}`
      )
    }
  }

  /** Tokeniza con el parser del paquete, en el proceso aparte. */
  async tokenize(request: DynamicTokenizeRequest): Promise<DynamicTokenizeResult> {
    await this.verifyPaths(request)
    const worker = this.ensureWorker()
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }

    // El primer `postMessage` NO puede salir antes de que el proceso exista: si
    // se pierde, el pedido muere por timeout y el archivo queda sin color (el
    // "a veces no pinta"). Se espera a que el worker esté listo.
    if (typeof worker.whenReady === 'function') await worker.whenReady()

    // El arranque en frío tarda más: el primer pedido tiene su propio margen.
    const timeoutMs = this.cold ? this.firstRequestTimeoutMs : this.requestTimeoutMs

    const id = this.nextId++
    return await new Promise<DynamicTokenizeResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        // Un wasm colgado no se recupera: se mata el proceso entero. Es
        // preferible perder el resaltado de un lenguaje a perder la ventana.
        this.stop()
        reject(new Error(`tokenizado dinámico sin respuesta en ${timeoutMs} ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer, startedAt: Date.now() })
      try {
        worker.postMessage({ id, type: 'tokenize', payload: request })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
}

/** Instancia única del main. */
export const treeSitterManager = new TreeSitterManager()

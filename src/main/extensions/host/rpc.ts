/**
 * Peer RPC del Extension Host — la ÚNICA pieza que conoce el transporte.
 *
 * El mismo módulo corre en los dos lados: lo único que cambia es
 * `idSign` (+1 en el main, -1 en el host) para que las dos direcciones
 * repartan ids sin coordinarse y un `send` que sabe a dónde va el mensaje.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Cuando Owear reemplace el runtime de ejecución, se reescribe SÓLO el
 * `send`/recepción (hoy `process.parentPort` de Electron). Este archivo, el
 * shim y el `vscodeApi` quedan intactos: no saben de Electron ni de stdio.
 * NO metas aquí lógica del shim ni del ciclo de vida de extensiones.
 */

import type {
  HostEvent,
  HostMessage,
  HostMethod,
  HostRequestMessage,
  HostToMainMethod,
  MainEvent
} from '@shared/extensionHost/protocol'

/** Métodos que ESTE peer sabe enviar (según el lado). */
export type RpcMethod = HostMethod | HostToMainMethod

/**
 * Eventos que viajan por el canal: host → main (`HostEvent`) y main → host
 * (`MainEvent`). Son eventos, no peticiones: nadie espera respuesta, así que
 * un hecho que llega cuando el otro lado está muerto simplemente se pierde.
 */
export type RpcEvent = HostEvent | MainEvent

export interface RpcTransport {
  /** Envía un mensaje al otro extremo (best-effort). */
  send(message: HostMessage): void
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | undefined
  method: string
}

type RequestHandler = (params: unknown) => unknown | Promise<unknown>
type EventListener = (payload: unknown) => void

/** Error de una petición que el otro lado rechazó o que expiró. */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly method: string
  ) {
    super(message)
    this.name = 'RpcError'
  }
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export interface RpcPeerOptions {
  /**
   * Signo de los ids que ESTE lado inicia. Main = +1 (positivos), host = -1
   * (negativos). Evita colisiones sin un handshake de ids.
   */
  idSign: 1 | -1
  /** Nombre del lado, sólo para mensajes de error. */
  label: string
  /** Timeout por defecto de las peticiones que este lado inicia. */
  defaultTimeoutMs?: number
}

export class RpcPeer {
  private readonly pending = new Map<number, PendingRequest>()
  private readonly handlers = new Map<string, RequestHandler>()
  private readonly listeners = new Map<RpcEvent, Set<EventListener>>()
  private nextId = 1
  private disposed = false

  constructor(
    private readonly transport: RpcTransport,
    private readonly options: RpcPeerOptions
  ) {}

  // ── API del lado que inicia ─────────────────────────────────────────────

  /** Petición con respuesta. Rechaza con `RpcError` si expira o falla. */
  async request<T = unknown>(
    method: RpcMethod,
    params?: unknown,
    timeoutMs?: number
  ): Promise<T> {
    if (this.disposed) {
      throw new RpcError(`[${this.options.label}] peer cerrado`, method)
    }
    const id = this.options.idSign * this.nextId++
    const timeout = timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS

    return new Promise<T>((resolve, reject) => {
      const timer =
        timeout > 0
          ? setTimeout(() => {
              this.pending.delete(id)
              reject(
                new RpcError(
                  `[${this.options.label}] "${method}" no respondió en ${timeout}ms`,
                  method
                )
              )
            }, timeout)
          : undefined

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        method
      })

      this.transport.send({ kind: 'request', id, method, params } satisfies HostRequestMessage)
    })
  }

  /** Evento sin respuesta (host → main y main → host). */
  emit(event: RpcEvent, payload?: unknown): void {
    if (this.disposed) return
    this.transport.send({ kind: 'event', event, payload })
  }

  // ── API del lado que responde ───────────────────────────────────────────

  /** Registra el handler de un método que el otro lado puede invocar. */
  handle(method: RpcMethod, handler: RequestHandler): void {
    this.handlers.set(method, handler)
  }

  /** Suscribe a un evento del otro lado. Devuelve el unsubscribe. */
  on(event: RpcEvent, listener: EventListener): () => void {
    const set = this.listeners.get(event) ?? new Set<EventListener>()
    set.add(listener)
    this.listeners.set(event, set)
    return () => set.delete(listener)
  }

  // ── Recepción ───────────────────────────────────────────────────────────

  /** Procesa un mensaje entrante. Nunca lanza: un mensaje roto se loguea. */
  receive(message: HostMessage): void {
    if (this.disposed) return

    if (message.kind === 'response') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (pending.timer) clearTimeout(pending.timer)
      if (message.error) {
        pending.reject(new RpcError(message.error, pending.method))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.kind === 'event') {
      const set = this.listeners.get(message.event)
      if (!set) return
      for (const listener of [...set]) {
        try {
          listener(message.payload)
        } catch (error) {
          // Un listener roto no puede cortar a los demás.
          void error
        }
      }
      return
    }

    // kind === 'request' → lo atendemos nosotros.
    const handler = this.handlers.get(message.method)
    if (!handler) {
      this.transport.send({
        kind: 'response',
        id: message.id,
        error: `[${this.options.label}] método desconocido: ${message.method}`
      })
      return
    }

    void Promise.resolve()
      .then(() => handler(message.params))
      .then(
        (result) => this.transport.send({ kind: 'response', id: message.id, result }),
        (error: unknown) =>
          this.transport.send({
            kind: 'response',
            id: message.id,
            error: error instanceof Error ? error.message : String(error)
          })
      )
  }

  /** Rechaza todo lo pendiente y deja el peer inerte (proceso que muere). */
  dispose(reason = 'peer cerrado'): void {
    if (this.disposed) return
    this.disposed = true
    for (const [id, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(new RpcError(`[${this.options.label}] ${reason}`, pending.method))
      this.pending.delete(id)
    }
    this.handlers.clear()
    this.listeners.clear()
  }

  get isDisposed(): boolean {
    return this.disposed
  }
}

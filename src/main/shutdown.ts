// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cierre ordenado de la aplicación.
 *
 * Existe porque `before-quit` es el ÚNICO punto donde todavía se puede hacer
 * trabajo asíncrono antes de que el proceso muera, y el patrón anterior lo
 * desperdiciaba:
 *
 * ```ts
 * app.on('before-quit', () => {
 *   void flushAllTokens()      // la promesa se pierde si Electron cierra ya
 * })
 * ```
 *
 * Electron no espera a esa promesa. En el mejor caso el flush se completa por
 * suerte; en el peor, el proceso termina a mitad y el último refresh de token se
 * pierde — el usuario cierra y al volver a abrir tiene que re-autenticarse.
 *
 * Módulo aparte, sin `electron`, para poder probar el bloqueo con operaciones
 * asíncronas controladas: los temporizadores y la interlock son justo lo que no
 * se puede comprobar leyendo el código.
 */

/** Tiempo máximo que se le da a las operaciones asíncronas de cierre. */
export const SHUTDOWN_TIMEOUT_MS = 3000

export interface ShutdownDeps {
  /** Persiste los tokens de todas las cuentas. */
  flushTokens: () => Promise<void>
  /** Termina los utility processes de extensiones. */
  shutdownHosts: () => Promise<void>
  /** Detiene los servidores de búsqueda. Síncrono, no debería fallar. */
  stopSearchServers: () => void
  /** Reanuda la salida de la app. */
  quit: () => void
}

export interface ShutdownResult {
  /** `false` si alguna operación agotó el timeout. */
  completed: boolean
  /** Operaciones que no terminou a tiempo. */
  timedOut: string[]
  /** Operaciones que fallaron (el cierre continua igualmente). */
  failed: string[]
}

/**
 * Ejecuta el cierre y devuelve el resultado. Nunca lanza: un fallo al guardar
 * la sesión no puede impedir que la app se cierre, porque dejar al usuario
 * colgado con un proceso vivo es peor que perder un token.
 *
 * Las operaciones corren en paralelo y todas se lanzan aunque una falle: no
 * tiene sentido abortar el apagado de los extension hosts porque el flush de
 * tokens dio error.
 */
export async function runShutdown(deps: ShutdownDeps, timeoutMs: number = SHUTDOWN_TIMEOUT_MS): Promise<ShutdownResult> {
  const result: ShutdownResult = { completed: true, timedOut: [], failed: [] }

  const tracked = async (name: string, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await withTimeout(Promise.resolve().then(fn), name, timeoutMs, result)
    } catch {
      result.failed.push(name)
    }
  }

  await Promise.all([
    tracked('flushTokens', deps.flushTokens),
    tracked('shutdownHosts', deps.shutdownHosts),
    tracked('stopSearchServers', () => deps.stopSearchServers())
  ])

  result.completed = result.timedOut.length === 0

  // Salir siempre: si el timeout venció, esperar más no va a melhorar nada y
  // el usuario ya pidió cerrar la app.
  deps.quit()
  return result
}

/**
 * Rechaza con `TimeoutError` si la promesa no resuelve dentro de `ms`.
 *
 * `Promise.race` por sí solo dejaría la promesa original colgando y su
 * `catch` sin manejar; esto limpia el temporizador y evita la rechazo no
 * manejado que, con Node 24, es fatal por defecto.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  name: string,
  ms: number,
  result: ShutdownResult
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      result.timedOut.push(name)
      reject(new Error(`shutdown timeout: ${name} (${ms}ms)`))
    }, ms)
    // Un temporizador pendiente mantiene vivo el event loop; en un apagado
    // solo queremos que exista mientras la operación esté en curso.
    timer.unref?.()
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Instala el handler de `before-quit`.
 *
 * La primera llamada `preventDefault()` para poder esperar al trabajo asíncrono
 * y luego reanudar la salida. La segunda (la que dispara `quit()`) ya no se
 * detiene: sin esa guarda, `preventDefault` + `quit` volvería a entrar aquí y
 * el proceso nunca saldría.
 */
export function installShutdownHandler(
  app: {
    // Firma acotada a `before-quit`: `Electron.App.on` está sobrecargado por
    // nombre de evento, así que un `(event: string, …)` genérico no es
    // asignable. Sólo registramos ese evento.
    on(
      event: 'before-quit',
      listener: (event: { preventDefault: () => void }) => void
    ): unknown
    quit: () => void
  },
  deps: Omit<ShutdownDeps, 'quit'>,
  timeoutMs: number = SHUTDOWN_TIMEOUT_MS
): void {
  let quitting = false

  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()

    void runShutdown(
      {
        ...deps,
        quit: () => app.quit()
      },
      timeoutMs
    ).catch(() => {
      // `runShutdown` no debería lanzar nunca, pero si lo hiciera la app
      // quedaría viva sin salida: mejor salir a lo bruto.
      app.quit()
    })
  })
}
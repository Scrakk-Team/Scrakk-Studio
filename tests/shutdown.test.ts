// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del cierre ordenado.
 *
 * Lo que se verifica aquí no es "se llama a la función" sino las garantías de
 * tiempo: que el proceso espere a una promesa lenta, que no espere indefinidamente
 * a una colgada, y que un ciclo extra de `before-quit` no deje la app atrapada.
 */

import { describe, it, expect, vi } from 'vitest'
import { runShutdown, installShutdownHandler, SHUTDOWN_TIMEOUT_MS } from '../src/main/shutdown'

/** Promesa que se resuelve a mano: control total sobre el reloj. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function deps(overrides: Partial<Parameters<typeof runShutdown>[0]> = {}): Parameters<typeof runShutdown>[0] {
  return {
    flushTokens: async () => {},
    shutdownHosts: async () => {},
    stopSearchServers: () => {},
    quit: () => {},
    ...overrides
  }
}

describe('runShutdown', () => {
  it('espera a que el flush termine antes de salir', async () => {
    const gate = deferred()
    const quit = vi.fn()
    let flushed = false

    const promise = runShutdown(
      deps({
        flushTokens: () => gate.promise.then(() => {
          flushed = true
        }),
        quit
      })
    )

    // La salida no puede haber ocurrido mientras la promesa sigue pendiente.
    await Promise.resolve()
    expect(quit).not.toHaveBeenCalled()
    expect(flushed).toBe(false)

    gate.resolve()
    const result = await promise

    expect(flushed).toBe(true)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(result.completed).toBe(true)
  })

  it('espera a varias cuentas: el flush completo termina antes de salir', async () => {
    const gates = [deferred(), deferred(), deferred()]
    const quit = vi.fn()
    const finished: number[] = []

    const promise = runShutdown(
      deps({
        // `flushAllTokens` recorre las cuentas DENTRO de la misma llamada, en
        // serie. Lo que hay que comprobar es que la salida espere a la última.
        flushTokens: async () => {
          for (let i = 0; i < gates.length; i++) {
            await gates[i].promise
            finished.push(i)
          }
        },
        quit
      })
    )

    gates[0].resolve()
    await vi.waitFor(() => expect(finished).toEqual([0]))
    expect(quit).not.toHaveBeenCalled()

    gates[1].resolve()
    await vi.waitFor(() => expect(finished).toEqual([0, 1]))
    expect(quit).not.toHaveBeenCalled()

    gates[2].resolve()
    const result = await promise

    expect(finished).toEqual([0, 1, 2])
    expect(quit).toHaveBeenCalledTimes(1)
    expect(result.completed).toBe(true)
  })

  it('no espera indefinidamente a una operación colgada', async () => {
    vi.useFakeTimers()
    try {
      const hung = deferred()
      const quit = vi.fn()

      const promise = runShutdown(
        deps({
          flushTokens: () => hung.promise,
          shutdownHosts: async () => {},
          quit
        }),
        3000
      )

      await vi.advanceTimersByTimeAsync(2999)
      expect(quit).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(2)
      const result = await promise

      expect(result.completed).toBe(false)
      expect(result.timedOut).toEqual(['flushTokens'])
      // Aunque el flush colgara, la app se cierra igual.
      expect(quit).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('una operación que falla no impide el cierre ni las demás', async () => {
    const quit = vi.fn()
    const stopped = vi.fn()
    const hostsDown = vi.fn()

    const result = await runShutdown(
      deps({
        flushTokens: async () => {
          throw new Error('disco lleno')
        },
        shutdownHosts: async () => {
          hostsDown()
        },
        stopSearchServers: () => {
          stopped()
        },
        quit
      })
    )

    expect(result.failed).toEqual(['flushTokens'])
    expect(result.completed).toBe(true)
    expect(hostsDown).toHaveBeenCalledTimes(1)
    expect(stopped).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('reporta cada operación que agotó el timeout', async () => {
    vi.useFakeTimers()
    try {
      const quit = vi.fn()
      const promise = runShutdown(
        deps({
          flushTokens: () => deferred().promise,
          shutdownHosts: () => deferred().promise,
          quit
        }),
        1000
      )

      await vi.advanceTimersByTimeAsync(1100)
      const result = await promise

      expect(result.timedOut.sort()).toEqual(['flushTokens', 'shutdownHosts'])
      expect(quit).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('no lanza aunque una operación rechace de forma síncrona', async () => {
    const quit = vi.fn()
    await expect(
      runShutdown(
        deps({
          flushTokens: () => {
            throw new Error('boom síncrono')
          },
          quit
        })
      )
    ).resolves.toMatchObject({ completed: true, failed: ['flushTokens'] })
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('el timeout por defecto está acotado', () => {
    expect(SHUTDOWN_TIMEOUT_MS).toBeGreaterThan(0)
    expect(SHUTDOWN_TIMEOUT_MS).toBeLessThanOrEqual(10_000)
  })
})

describe('installShutdownHandler', () => {
  function fakeApp() {
    const listeners: ((event: { preventDefault: () => void }) => void)[] = []
    return {
      quit: vi.fn(),
      on(event: string, listener: (event: { preventDefault: () => void }) => void) {
        if (event === 'before-quit') listeners.push(listener)
      },
      emit() {
        const event = { preventDefault: vi.fn() }
        for (const listener of listeners) listener(event)
        return event
      },
      listenerCount() {
        return listeners.length
      }
    }
  }

  it('impide la salida en el primer before-quit y la reanuda tras el flush', async () => {
    const app = fakeApp()
    const gate = deferred()
    let flushed = false

    installShutdownHandler(app as never, {
      flushTokens: () => gate.promise.then(() => {
        flushed = true
      }),
      shutdownHosts: async () => {},
      stopSearchServers: () => {}
    })

    const event = app.emit()
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(app.quit).not.toHaveBeenCalled()

    gate.resolve()
    // Deja que la cadena de promesas se vacíe.
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledTimes(1))
    expect(flushed).toBe(true)
  })

  it('un segundo before-quit no vuelve a bloquear la salida', async () => {
    const app = fakeApp()
    const flushed = vi.fn().mockResolvedValue(undefined)

    installShutdownHandler(app as never, {
      flushTokens: flushed,
      shutdownHosts: async () => {},
      stopSearchServers: () => {}
    })

    app.emit()
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledTimes(1))

    // `quit()` vuelve a disparar `before-quit`. Esta vez NO debe hacer
    // preventDefault, o la app nunca saldría.
    const second = app.emit()
    expect(second.preventDefault).not.toHaveBeenCalled()

    await new Promise((resolve) => setTimeout(resolve, 10))
    // Y el flush no se ejecuta por duplicado.
    expect(flushed).toHaveBeenCalledTimes(1)
  })

  it('registra un único listener', () => {
    const app = fakeApp()
    installShutdownHandler(app as never, {
      flushTokens: async () => {},
      shutdownHosts: async () => {},
      stopSearchServers: () => {}
    })
    expect(app.listenerCount()).toBe(1)
  })
})
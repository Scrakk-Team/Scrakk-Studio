// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sync LSP en vivo — el RITMO importa tanto como el contenido.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ FIJA ESTE TEST
 *
 * Que un diagnóstico no espere a que el usuario deje de tipear. El sync tenía
 * un debounce clásico de 250 ms: cada tecla reiniciaba el reloj, así que la
 * última tecla de una palabra quedaba un cuarto de segundo en el aire antes de
 * que el server supiera que el documento cambió (medido en la app real con
 * `tools/_probe-lsp-realtime.mjs`).
 *
 * Acá se fija el contrato nuevo, que es el de VS Code:
 *   1. la primera edición de una ráfaga sale **YA** (latencia 0),
 *   2. lo que se agrupa es el resto: nunca más de una ventana entre cambios,
 *   3. texto idéntico no viaja (no hay nada que sincronizar),
 *   4. cerrar la tab cierra el documento en el server.
 *
 * Se usan fake timers porque el punto es el RELOJ: con timers reales el test
 * mediría la máquina, no la lógica.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** Editor simulado: sólo lo que `fileSync` consume de la feature. */
interface FakeSession {
  emit(text: string): void
  listeners: Set<(text: string) => void>
}

const sessions = new Map<string, FakeSession>()
let openPaths: string[] = []
let busListener: (() => void) | null = null

vi.mock('@features/editor', () => ({
  getEditorFiles: () => ({ openFiles: openPaths.map((path) => ({ path })) }),
  subscribeToEditorFiles: (cb: () => void) => {
    busListener = cb
    return () => {
      busListener = null
    }
  },
  getFileSession: (path: string) => {
    const session = sessions.get(path)
    if (!session) return undefined
    return {
      // El real emite YA el contenido actual al suscribirse (el archivo puede
      // estar cargado y quieto): el fake lo replica para que el test mida lo
      // mismo que pasa en la app.
      onDidChangeContent: (cb: (text: string) => void) => {
        session.listeners.add(cb)
        cb(session['text'] ?? '')
        return () => session.listeners.delete(cb)
      },
      getText: () => session['text'] ?? ''
    }
  }
}))

import { initLspFileSync } from '@services/lsp/fileSync'

function makeSession(text = ''): FakeSession {
  const session: FakeSession = {
    listeners: new Set(),
    emit(next: string): void {
      session['text'] = next
      for (const listener of [...session.listeners]) listener(next)
    }
  }
  session['text'] = text
  return session
}

function makeSink(): { notify: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
  return { notify: vi.fn(), close: vi.fn() }
}

/** Abre una tab: el fake guarda los archivos y avisa al bus. */
function openTab(path: string, text: string): FakeSession {
  const session = makeSession(text)
  sessions.set(path, session)
  openPaths = [...openPaths, path]
  busListener?.()
  return session
}

beforeEach(() => {
  vi.useFakeTimers()
  sessions.clear()
  openPaths = []
  busListener = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sync LSP en vivo', () => {
  it('al abrir una tab manda el estado actual (didOpen)', () => {
    const sink = makeSink()
    initLspFileSync(sink)

    openTab('/w/a.css', 'body {}\n')

    expect(sink.notify).toHaveBeenCalledTimes(1)
    expect(sink.notify).toHaveBeenCalledWith('/w/a.css', 'body {}\n')
  })

  it('la PRIMERA edición sale YA: no espera a que dejes de tipear', () => {
    const sink = makeSink()
    initLspFileSync(sink)
    const session = openTab('/w/a.css', 'body {}\n')
    sink.notify.mockClear()

    // 100 ms quieto (más que la ventana): la próxima edición no tiene por qué
    // esperar nada.
    vi.advanceTimersByTime(100)
    session.emit('body { color: ; }\n')

    // Sin avanzar NINGÚN timer: ya salió.
    expect(sink.notify).toHaveBeenCalledTimes(1)
    expect(sink.notify).toHaveBeenCalledWith('/w/a.css', 'body { color: ; }\n')
  })

  it('una ráfaga de tecleo se agrupa: máximo un envío por ventana', () => {
    const sink = makeSink()
    initLspFileSync(sink)
    const session = openTab('/w/a.css', '')
    vi.advanceTimersByTime(100)
    sink.notify.mockClear()

    // 10 revisiones en 5 ms (tipeo rápido).
    for (let index = 1; index <= 10; index += 1) {
      session.emit('x'.repeat(index))
      vi.advanceTimersByTime(0.5)
    }
    expect(sink.notify).toHaveBeenCalledTimes(1) // la primera salió ya
    expect(sink.notify).toHaveBeenLastCalledWith('/w/a.css', 'x')

    // Lo que queda de la ráfaga sale AL CERRAR la ventana, no antes.
    vi.advanceTimersByTime(40)
    expect(sink.notify).toHaveBeenCalledTimes(2)
    expect(sink.notify).toHaveBeenLastCalledWith('/w/a.css', 'x'.repeat(10))

    // Y no hay envíos de más después.
    vi.advanceTimersByTime(1000)
    expect(sink.notify).toHaveBeenCalledTimes(2)
  })

  it('texto idéntico no viaja', () => {
    const sink = makeSink()
    initLspFileSync(sink)
    const session = openTab('/w/a.css', 'a {}\n')
    vi.advanceTimersByTime(100)
    sink.notify.mockClear()

    session.emit('a {}\n') // la revisión subió, el texto no cambió
    vi.advanceTimersByTime(200)

    expect(sink.notify).not.toHaveBeenCalled()
  })

  it('cerrar la tab cierra el documento (didClose) y deja de mirarlo', () => {
    const sink = makeSink()
    initLspFileSync(sink)
    const session = openTab('/w/a.css', 'a {}\n')
    vi.advanceTimersByTime(100)
    sink.notify.mockClear()

    openPaths = []
    busListener?.()

    expect(sink.close).toHaveBeenCalledWith('/w/a.css')
    session.emit('a { color: ; }\n')
    vi.advanceTimersByTime(200)
    expect(sink.notify).not.toHaveBeenCalled()
  })
})

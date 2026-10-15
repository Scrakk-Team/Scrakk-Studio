// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Estado de generación por sesión FUERA del componente: es lo que hace que el
 * botón siga en "Detener" (y el envío siga bloqueado) cuando el panel se mueve o
 * se remonta. Antes vivía en un `useState` del panel y el remonte lo perdía.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  beginRun,
  endRun,
  getRunPromise,
  isGenerating,
  setRunPromise,
  stopRun,
  subscribeRuns
} from '../src/renderer/src/services/chat/chatRuns'

function controller(): AbortController {
  return new AbortController()
}

describe('chatRuns — estado de generación por sesión', () => {
  it('marca/frena la generación de la sesión', () => {
    const c = controller()
    expect(isGenerating('a')).toBe(false)
    beginRun('a', c)
    expect(isGenerating('a')).toBe(true)
    expect(isGenerating('b')).toBe(false) // es por sesión
    endRun('a', c)
    expect(isGenerating('a')).toBe(false)
  })

  it('notifica a los suscriptores en arrancar y terminar', () => {
    let calls = 0
    const off = subscribeRuns(() => calls++)
    const c = controller()
    beginRun('s', c)
    endRun('s', c)
    expect(calls).toBe(2)
    off()
  })

  it('stopRun aborta el stream en curso', () => {
    const c = controller()
    beginRun('s', c)
    stopRun('s')
    expect(c.signal.aborted).toBe(true)
    stopRun(null) // no explota
    stopRun('inexistente')
  })

  it('un finally VIEJO no apaga el run nuevo (mismo controller)', () => {
    const old = controller()
    const fresh = controller()
    beginRun('s', old)
    beginRun('s', fresh) // reemplaza (editar mientras responde)
    endRun('s', old) // el finally del viejo
    expect(isGenerating('s')).toBe(true) // sigue el nuevo
    endRun('s', fresh)
    expect(isGenerating('s')).toBe(false)
  })

  it('la promesa publicada se puede leer (para esperarla)', () => {
    const c = controller()
    beginRun('s', c)
    const p = Promise.resolve()
    setRunPromise('s', p)
    expect(getRunPromise('s')).toBe(p)
    expect(getRunPromise('nope')).toBeNull()
  })
})

describe('ChatPanel — el estado de generación se lee después de declarar sessionId', () => {
  it('no hay uso antes de la declaración (TDZ)', () => {
    // `tsc` NO detecta esto: el `sessionId` se usa dentro de una función
    // (`() => isGenerating(sessionId)`), así que una declaración posterior pasaba
    // el typecheck y explotaba en runtime ("Cannot access 'sessionId' before
    // initialization"). Este test fija el orden en el código fuente.
    const panel = readFileSync(
      new URL(
        '../src/renderer/src/features/layout/panels/ChatPanel/ChatPanel.tsx',
        import.meta.url
      ),
      'utf8'
    )
    const declaredAt = panel.indexOf('const sessionId =')
    const usedAt = panel.indexOf('isGenerating(sessionId)')
    expect(declaredAt).toBeGreaterThan(-1)
    expect(usedAt).toBeGreaterThan(declaredAt)
  })
})

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tabs acopladas al panel (store de `features/tabs/dock.ts`).
 *
 * El modo se expone como comando `tabs.toggleDocked` (Ctrl+Alt+D por defecto);
 * acá se fija el contrato del store que ese comando usa: cambio idempotente,
 * notificación a los suscriptores y persistencia (cuando hay storage).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  isTabsDocked,
  setTabsDocked,
  subscribeToTabsDocked,
  toggleTabsDocked
} from '../src/renderer/src/features/tabs/dock'

describe('tabs acopladas', () => {
  beforeEach(() => setTabsDocked(false))

  it('toggle cambia el modo y notifica una vez', () => {
    const seen: boolean[] = []
    const unsub = subscribeToTabsDocked(() => seen.push(isTabsDocked()))
    toggleTabsDocked()
    expect(isTabsDocked()).toBe(true)
    unsub()
    expect(seen).toEqual([true])
  })

  it('set es idempotente: fijar el mismo valor NO emite', () => {
    let emitted = 0
    const unsub = subscribeToTabsDocked(() => {
      emitted += 1
    })
    setTabsDocked(false) // ya estaba en false
    expect(emitted).toBe(0)
    setTabsDocked(true)
    expect(emitted).toBe(1)
    setTabsDocked(true) // repetido
    expect(emitted).toBe(1)
    unsub()
  })

  it('persiste el modo cuando hay storage', () => {
    if (typeof localStorage === 'undefined') return // entorno sin storage
    setTabsDocked(true)
    expect(localStorage.getItem('scrakk:tabs-docked')).toBe('1')
    setTabsDocked(false)
    expect(localStorage.getItem('scrakk:tabs-docked')).toBe('0')
  })
})

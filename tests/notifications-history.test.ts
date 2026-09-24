// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del historial de notificaciones y del kind anchored de modales
 * (popover anclado sin overlay, con toggle por key).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { notificationRegistry } from '../src/renderer/src/services/notifications/registry'
import {
  showModal,
  showAnchoredModal,
  anchoredModalId,
  closeModal,
  closeAllModals,
  snapshotModals
} from '../src/renderer/src/services/modals/registry'

describe('notificaciones — historial', () => {
  beforeEach(() => {
    closeAllModals()
    notificationRegistry.clearHistory()
    for (const n of notificationRegistry.list()) notificationRegistry.dismiss(n.id)
    notificationRegistry.clearHistory()
  })

  it('dismiss guarda snapshot sin callbacks y ordena nuevas primero', () => {
    const first = notificationRegistry.show({ title: 'Primera' })
    const second = notificationRegistry.show({ title: 'Segunda' })
    notificationRegistry.dismiss(first)
    notificationRegistry.dismiss(second)

    const history = notificationRegistry.history()
    expect(history).toHaveLength(2)
    // Nuevas primero.
    expect(history[0].title).toBe('Segunda')
    expect(history[1].title).toBe('Primera')
    expect(typeof history[0].dismissedAt).toBe('number')
    // Las activas ya no están.
    expect(notificationRegistry.list()).toHaveLength(0)
  })

  it('expiradas por timeout también entran al historial', () => {
    vi.useFakeTimers()
    try {
      notificationRegistry.show({ title: 'Efímera', timeoutMs: 10 })
      expect(notificationRegistry.list()).toHaveLength(1)
      vi.advanceTimersByTime(50)
      expect(notificationRegistry.list()).toHaveLength(0)
      expect(notificationRegistry.history().map((h) => h.title)).toContain('Efímera')
    } finally {
      vi.useRealTimers()
    }
  })

  it('historial acotado a 50 y clearHistory solo toca el historial', () => {
    for (let i = 0; i < 60; i++) {
      const id = notificationRegistry.show({ title: `N${i}` })
      notificationRegistry.dismiss(id)
    }
    expect(notificationRegistry.history()).toHaveLength(50)
    expect(notificationRegistry.history()[0].title).toBe('N59')

    const live = notificationRegistry.show({ title: 'Viva' })
    notificationRegistry.clearHistory()
    expect(notificationRegistry.history()).toHaveLength(0)
    // La activa sigue.
    expect(notificationRegistry.list().map((n) => n.id)).toContain(live)
    notificationRegistry.dismiss(live)
  })
})

describe('modales — kind anchored', () => {
  beforeEach(() => {
    closeAllModals()
  })

  const anchor = { x: 100, y: 700, width: 32, height: 28 }

  it('abre sin overlay (kind + anchor) y cierra con closeModal', () => {
    const handle = showAnchoredModal({
      key: 'test-popover',
      title: 'Test',
      anchor,
      render: () => null
    })
    expect(handle).not.toBeNull()
    const entry = snapshotModals().find((m) => m.spec.kind === 'anchored')
    expect(entry).toBeDefined()
    if (entry?.spec.kind === 'anchored') {
      expect(entry.spec.anchor).toEqual(anchor)
    }
    closeModal(handle!.id)
    expect(anchoredModalId('test-popover')).toBeNull()
  })

  it('misma key hace toggle (segunda llamada cierra)', () => {
    const first = showAnchoredModal({ key: 'toggle', title: 'T', anchor, render: () => null })
    expect(first).not.toBeNull()
    expect(anchoredModalId('toggle')).toBe(first!.id)
    const second = showAnchoredModal({ key: 'toggle', title: 'T', anchor, render: () => null })
    expect(second).toBeNull()
    expect(anchoredModalId('toggle')).toBeNull()
  })

  it('sin key permite varios anclados a la vez', () => {
    showAnchoredModal({ title: 'A', anchor, render: () => null })
    showAnchoredModal({ title: 'B', anchor, render: () => null })
    expect(snapshotModals().filter((m) => m.spec.kind === 'anchored')).toHaveLength(2)
  })

  it('no rompe showModal/showOptionModal existentes', () => {
    const h = showModal({ title: 'X', render: () => null })
    expect(snapshotModals()).toHaveLength(1)
    closeModal(h)
  })
})

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Comandos de paleta de los eventos.
 *
 *  - UN comando por evento (`events.activate.<id>`): "activar el evento". Es el
 *    camino manual, y por eso IGNORA la ventana (probás en julio si querés).
 *  - `events.stop`: corta el activo y restaura.
 *  - `events.list`: qué eventos hay y en qué estado está su ventana.
 *  - testing: prender el modo, mover el RELOJ FALSO y reiniciar el estado.
 *
 * Va TODO por el registry de comandos: la paleta los levanta sola.
 */

import { commandRegistry } from '@services/commands'
import { notify } from '@services/notifications'
import { listEvents, subscribeToEvents } from '@services/extensions/types/events/logic'
import { t } from '@core/i18n'
import {
  activateEvent,
  getActiveEventId,
  getEventWindow,
  stopActiveEvent
} from './runtime'
import {
  clearFakeNow,
  getEventNow,
  isTestingEvents,
  shiftFakeNow,
  subscribeTestingEvents,
  toggleTestingEvents
} from './testing'
import { clearEventState } from './state'

/** Categoría en la paleta. */
const CATEGORY = 'Eventos'
const TEST_CATEGORY = 'Eventos (testing)'

let booted = false
/** Comandos por evento (id → baja). */
const perEvent = new Map<string, () => void>()
/** Bajas de los comandos fijos. */
const disposers: Array<() => void> = []
let unsubscribeRegistry: (() => void) | null = null
let unsubscribeTesting: (() => void) | null = null
let toggleDisposer: (() => void) | null = null

/** Registra (y poda) un comando de activación por evento. */
function syncEventCommands(): void {
  const ids = new Set<string>()
  for (const entry of listEvents()) {
    ids.add(entry.id)
    if (perEvent.has(entry.id)) continue
    const off = commandRegistry.register({
      id: `events.activate.${entry.id}`,
      title: entry.name,
      category: CATEGORY,
      run: () => {
        activateEvent(entry.id, { force: true })
      }
    })
    perEvent.set(entry.id, off)
  }
  for (const [id, off] of perEvent) {
    if (ids.has(id)) continue
    off()
    perEvent.delete(id)
  }
}

/** El comando de testing cambia de título según el modo. */
function syncTestingToggle(): void {
  toggleDisposer?.()
  toggleDisposer = commandRegistry.register({
    id: 'events.testing.toggle',
    title: t(
      isTestingEvents() ? 'services.event.testing.desactivar' : 'services.event.testing.activar'
    ),
    category: TEST_CATEGORY,
    run: () => {
      toggleTestingEvents()
      notify({
        title: 'Scrakk Studio',
        message: isTestingEvents()
          ? t('services.event.testing.desactivar')
          : t('services.event.testing.activar'),
        severity: 'info'
      })
    }
  })
}

/** Lista los eventos y el estado de su ventana (el detalle, en testing). */
function showEventList(): void {
  const events = listEvents()
  if (events.length === 0) {
    notify({ title: t('services.event.lista'), message: t('services.event.nada'), severity: 'info' })
    return
  }
  const testing = isTestingEvents()
  const activeId = getActiveEventId()
  const lines = events.map((entry) => {
    const marker = entry.id === activeId ? ' ●' : ''
    if (!testing) return `${entry.name}${marker}`
    const win = getEventWindow(entry.id)
    return `${entry.name}${marker} — ${win?.status ?? 'manual'}`
  })
  if (testing) {
    lines.push('', new Date(getEventNow()).toLocaleString())
  }
  notify({
    title: t('services.event.lista'),
    message: lines.join('\n'),
    severity: 'info',
    timeoutMs: 0
  })
}

/** Avisa dónde quedó el reloj falso. */
function announceClock(): void {
  notify({
    title: 'Scrakk Studio',
    message: new Date(getEventNow()).toLocaleString(),
    severity: 'info'
  })
}

/** Registra los comandos. Idempotente: se llama una vez desde el boot. */
export function registerEventCommands(): void {
  if (booted) return
  booted = true

  syncEventCommands()
  unsubscribeRegistry = subscribeToEvents(() => syncEventCommands())

  disposers.push(
    commandRegistry.register({
      id: 'events.stop',
      title: t('services.event.detener'),
      category: CATEGORY,
      run: () => stopActiveEvent()
    }),
    commandRegistry.register({
      id: 'events.list',
      title: t('services.event.lista'),
      category: CATEGORY,
      run: () => showEventList()
    }),
    commandRegistry.register({
      id: 'events.testing.clock.day',
      title: t('services.event.testing.reloj.avanzar.dia'),
      category: TEST_CATEGORY,
      run: () => {
        shiftFakeNow(1)
        announceClock()
      }
    }),
    commandRegistry.register({
      id: 'events.testing.clock.week',
      title: t('services.event.testing.reloj.avanzar.semana'),
      category: TEST_CATEGORY,
      run: () => {
        shiftFakeNow(7)
        announceClock()
      }
    }),
    commandRegistry.register({
      id: 'events.testing.clock.reset',
      title: t('services.event.testing.reloj.real'),
      category: TEST_CATEGORY,
      run: () => {
        clearFakeNow()
        announceClock()
      }
    }),
    commandRegistry.register({
      id: 'events.testing.state.reset',
      title: t('services.event.testing.reiniciar'),
      category: TEST_CATEGORY,
      run: () => {
        clearEventState()
        notify({
          title: 'Scrakk Studio',
          message: t('services.event.testing.reiniciar'),
          severity: 'success'
        })
      }
    })
  )

  syncTestingToggle()
  unsubscribeTesting = subscribeTestingEvents(() => syncTestingToggle())
}

/** Sólo para tests. */
export function unregisterEventCommandsForTests(): void {
  unsubscribeRegistry?.()
  unsubscribeTesting?.()
  unsubscribeRegistry = null
  unsubscribeTesting = null
  toggleDisposer?.()
  toggleDisposer = null
  for (const off of disposers) off()
  disposers.length = 0
  for (const off of perEvent.values()) off()
  perEvent.clear()
  booted = false
}

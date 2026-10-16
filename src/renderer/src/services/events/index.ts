// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Eventos SEF — API pública del runtime.
 *
 * `bootEvents()` lo llama `main.tsx` al arrancar. El resto es lo que consumen
 * la UI (chip de status, Ajustes) y los tests.
 */

export {
  activateEvent,
  deactivateEvent,
  stopActiveEvent,
  evaluateEvents,
  bootEvents,
  reloadEvents,
  appVersion,
  getActiveEvent,
  getActiveEventId,
  getEventWindow,
  subscribeToActiveEvent,
  resetEventsRuntimeForTests
} from './runtime'
export type { ActiveEventSnapshot } from './runtime'

export {
  getEventNow,
  getFakeNow,
  setFakeNow,
  shiftFakeNow,
  clearFakeNow,
  isTestingEvents,
  setTestingEvents,
  toggleTestingEvents,
  subscribeEventClock,
  subscribeTestingEvents,
  resetEventsTestingForTests
} from './testing'

export {
  clearEventState,
  getEventState,
  isEventDone,
  loadEventState
} from './state'
export type { EventStateRecord } from './state'

export { registerEventCommands, unregisterEventCommandsForTests } from './commands'

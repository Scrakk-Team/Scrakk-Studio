// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Eventos SEF — contrato de datos + resolución de ventana. */

export type {
  EventSchedule,
  EventActivation,
  EventActivationMode,
  EventOverride,
  EventSound,
  EventShape,
  EventMotion,
  EventOp,
  EventOpName,
  EventScene,
  EventDefinition
} from './types'
export { EVENT_SPEC_VERSION } from './types'

export {
  parseScheduleBound,
  compareVersions,
  satisfiesVersion,
  evaluateWindow,
  msUntilWindowClose
} from './schedule'
export type { WindowStatus, WindowEvaluation } from './schedule'

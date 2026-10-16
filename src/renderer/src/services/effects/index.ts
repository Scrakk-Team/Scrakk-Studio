// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Barrel público del motor de efectos de eventos (SEF).
 *
 * El runtime de eventos y el shell del IDE importan desde acá; los tests
 * importan `./engine` directo para no arrastrar React/CSS.
 */

export {
  engine,
  prefersReducedMotion,
  resolveEffectColor,
  parsePoint,
  flapFrame,
  resetEffectsForTests,
  MAX_PARTICLES
} from './engine'
export type {
  EffectStage,
  EffectStageFade,
  EffectEmitSpec,
  EffectViewport
} from './engine'
export { EffectsOverlay } from './EffectsOverlay'

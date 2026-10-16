// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * API pública del motor de audio.
 *
 * - `zzfx`: port de ZzFX (8 bits, sin archivos) + el AudioContext compartido.
 * - `mixer`: one-shots, ambientes por etiqueta, ducking y carga de audio REAL
 *   (un `data:`/`https:` decodificado, con `preloadSounds` para precalentarlo).
 */

export * from './zzfx'
export * from './mixer'

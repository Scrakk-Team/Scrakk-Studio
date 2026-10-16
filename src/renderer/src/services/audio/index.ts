// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * API pública del motor de audio sintetizado (sin archivos de sonido).
 *
 * - `zzfx`: port de ZzFX (generación de AudioBuffer y reproducción).
 * - `mixer`: one-shots, ambientes por etiqueta y ducking para el runtime.
 */

export * from './zzfx'
export * from './mixer'

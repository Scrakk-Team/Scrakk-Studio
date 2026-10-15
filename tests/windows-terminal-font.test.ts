// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * La "terminal gigante" en Windows: el `FontSize` de la consola se usaba CRUDO
 * como em del motor, cuando es el alto de celda en px de DISPOSITIVO. Linux manda
 * ~13 (em lógico); Windows mandaba 16+ (y más en HiDPI) → todo escalado ↑.
 *
 * `windowsConsoleEmPx` normaliza device→lógico y celda→em. Sólo cambia el NÚMERO:
 * el motor re-deriva charWidth/lineHeight del em, así que la grilla no se toca.
 */

import { describe, it, expect } from 'vitest'
import { windowsConsoleEmPx } from '../src/main/fonts/systemFonts'

describe('windowsConsoleEmPx', () => {
  it('el default de conhost (16) cae en el mismo rango que Linux (~13)', () => {
    expect(windowsConsoleEmPx(16, 1)).toBe(13)
  })

  it('un monitor HiDPI no duplica el tamaño', () => {
    // 150%: conhost guarda el alto en px de dispositivo (16 → 24).
    expect(windowsConsoleEmPx(24, 1.5)).toBe(13)
  })

  it('acota a un rango legible (nunca gigante)', () => {
    expect(windowsConsoleEmPx(48, 1)).toBe(22) // tope
    expect(windowsConsoleEmPx(6, 1)).toBe(10) // piso
    // scaleFactor inválido no explota.
    expect(windowsConsoleEmPx(16, 0)).toBe(13)
  })
})

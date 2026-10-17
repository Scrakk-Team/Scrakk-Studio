// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ¿Dónde cae el efecto? (ancla)
 *
 * El rayo baja desde arriba: si aterriza en el vacío se lee como fondo, no como
 * un golpe. Tiene que caer sobre algo REAL de la parte baja de la pantalla — un
 * botón, un input, un handle de resize.
 *
 * La función es pura (recibe rectángulos, devuelve un punto) para poder testear
 * la elección sin navegador: la parte con DOM es sólo `collectStrikeRects`.
 */

import { describe, expect, it } from 'vitest'
import { pickAnchor } from '../src/renderer/src/services/events/anchor'

const VIEWPORT = { w: 1000, h: 800 }

describe('pickAnchor', () => {
  it('elige el componente MÁS BAJO, y entre los bajos el más centrado', () => {
    const target = pickAnchor(
      [
        { left: 100, top: 100, width: 120, height: 32 }, // arriba
        { left: 860, top: 760, width: 80, height: 30 }, // abajo a la derecha
        { left: 460, top: 760, width: 80, height: 30 }, // abajo al centro ←
        { left: 480, top: 400, width: 80, height: 30 } // medio
      ],
      VIEWPORT
    )
    expect(target).toEqual({ x: 500, y: 775 })
  })

  it('ignora elementos diminutos o fuera de la ventana', () => {
    const target = pickAnchor(
      [
        { left: 10, top: 770, width: 3, height: 3 }, // diminuto
        { left: 10, top: 2000, width: 200, height: 40 }, // fuera
        { left: 300, top: 500, width: 100, height: 30 } // el único válido
      ],
      VIEWPORT
    )
    expect(target).toEqual({ x: 350, y: 515 })
  })

  it('sin candidatos cae abajo al centro (nunca en el vacío del medio)', () => {
    expect(pickAnchor([], VIEWPORT)).toEqual({ x: 500, y: 656 })
  })

  it('con pocos candidatos elige el más bajo aunque no esté centrado', () => {
    const target = pickAnchor(
      [
        { left: 0, top: 100, width: 100, height: 40 },
        { left: 20, top: 700, width: 100, height: 40 } // el más bajo
      ],
      VIEWPORT
    )
    expect(target).toEqual({ x: 70, y: 720 })
  })
})

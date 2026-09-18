/**
 * Tests de la matemática del lasso (sin DOM): el recuadro debe resolver a
 * los paths reales del árbol actual.
 */

import { describe, it, expect } from 'vitest'
import {
  lassoPaths,
  lassoRowRange
} from '../src/renderer/src/features/explorer/hooks/useSelectionBox'

// ROW_HEIGHT = 22: filas [0,22), [22,44), [44,66), …
const PATHS = ['/a', '/b', '/c', '/d', '/e']

describe('lassoRowRange', () => {
  it('cubre el rango intersectado (con margen de 2)', () => {
    const { firstRow, lastRow } = lassoRowRange(PATHS.length, 22, 22)
    expect(firstRow).toBe(0)
    expect(lastRow).toBe(4)
  })

  it('fuera de rango no itera (rango vacío efectivo)', () => {
    const { firstRow, lastRow } = lassoRowRange(3, -100, 10)
    expect(firstRow).toBe(0)
    expect(lastRow).toBeLessThan(firstRow)
    expect(lassoRowRange(3, 0, 10000).lastRow).toBe(2)
  })
})

describe('lassoPaths', () => {
  it('devuelve los paths intersectados en orden (bordes inclusivos)', () => {
    // Caja sobre las filas 1..2 → roza /a por el borde + /b y /c.
    expect(lassoPaths(PATHS, PATHS.length, 22, 22)).toEqual(['/a', '/b', '/c'])
  })

  it('caja puntual sobre una fila → solo esa', () => {
    expect(lassoPaths(PATHS, PATHS.length, 45, 1)).toEqual(['/c'])
  })

  it('fuera de todo → vacío (no commitea nada)', () => {
    expect(lassoPaths(PATHS, PATHS.length, 500, 10)).toEqual([])
  })

  it('respeta rowCount menor que los paths (árbol cambiado)', () => {
    expect(lassoPaths(PATHS, 2, 0, 200)).toEqual(['/a', '/b'])
  })
})

import { describe, expect, it } from 'vitest'
import {
  focusGuideLevel,
  relativeSegments,
  rowActiveGuideLevel
} from '@features/explorer/utils/indentGuides'

const ROOT = '/home/user/proyecto'

describe('relativeSegments', () => {
  it('relativiza contra el root', () => {
    expect(relativeSegments(ROOT, '/home/user/proyecto/src/a.ts')).toEqual(['src', 'a.ts'])
  })
  it('root → [] y fuera de root → []', () => {
    expect(relativeSegments(ROOT, ROOT)).toEqual([])
    expect(relativeSegments(ROOT, '/otro/lado')).toEqual([])
  })
  it('tolera backslashes y trailing slashes', () => {
    expect(relativeSegments('C:\\proj\\', 'C:\\proj\\src\\a.ts')).toEqual(['src', 'a.ts'])
  })
})

describe('focusGuideLevel', () => {
  it('nivel de la carpeta en foco', () => {
    expect(focusGuideLevel(ROOT, `${ROOT}/src`)).toBe(0)
    expect(focusGuideLevel(ROOT, `${ROOT}/src/components`)).toBe(1)
  })
  it('null sin root, foco o si es el root / fuera', () => {
    expect(focusGuideLevel(null, `${ROOT}/src`)).toBeNull()
    expect(focusGuideLevel(ROOT, null)).toBeNull()
    expect(focusGuideLevel(ROOT, ROOT)).toBeNull()
    expect(focusGuideLevel(ROOT, '/fuera')).toBeNull()
  })
})

describe('rowActiveGuideLevel', () => {
  const focus = { path: `${ROOT}/src/components`, level: 1 }
  it('descendientes resaltan SOLO el nivel de la carpeta', () => {
    expect(rowActiveGuideLevel(`${ROOT}/src/components/Button.tsx`, focus)).toBe(1)
    expect(rowActiveGuideLevel(`${ROOT}/src/components/sub/x.ts`, focus)).toBe(1)
  })
  it('ramas ajenas y la propia fila → null', () => {
    expect(rowActiveGuideLevel(`${ROOT}/docs/readme.md`, focus)).toBeNull()
    expect(rowActiveGuideLevel(`${ROOT}/src/components`, focus)).toBeNull()
    expect(rowActiveGuideLevel(`${ROOT}/src`, focus)).toBeNull()
  })
  it('null sin foco', () => {
    expect(rowActiveGuideLevel(`${ROOT}/src/a.ts`, null)).toBeNull()
  })
})

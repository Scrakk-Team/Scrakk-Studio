/**
 * Tests del versionado compartido — semver-lite y engine constraints.
 * Es la lógica que decide si el IDE tiene update pendiente (GitHub Releases).
 */

import { describe, it, expect } from 'vitest'
import {
  parseVersion,
  compareVersions,
  isNewerVersion,
  satisfiesEngine
} from '../src/shared/version'

describe('parseVersion', () => {
  it('parsea v-prefijo y sufijos', () => {
    expect(parseVersion('v0.2.1')).toEqual({ major: 0, minor: 2, patch: 1 })
    expect(parseVersion('1.10.3-beta.2')).toEqual({ major: 1, minor: 10, patch: 3 })
    expect(parseVersion('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 })
  })

  it('rechaza basura', () => {
    expect(parseVersion('abc')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('1.2')).toBeNull()
  })
})

describe('compareVersions / isNewerVersion', () => {
  it('ordena correctamente', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1)
    expect(compareVersions('v2.0.0', '1.99.99')).toBe(1)
  })

  it('isNewerVersion es estricto', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
  })
})

describe('satisfiesEngine (manifest.engine del CLI)', () => {
  it('>= funciona', () => {
    expect(satisfiesEngine('0.1.0', '>=0.1.0')).toBe(true)
    expect(satisfiesEngine('0.2.5', '>=0.1.0')).toBe(true)
    expect(satisfiesEngine('0.0.9', '>=0.1.0')).toBe(false)
  })

  it('> estricto', () => {
    expect(satisfiesEngine('0.1.0', '>0.1.0')).toBe(false)
    expect(satisfiesEngine('0.1.1', '>0.1.0')).toBe(true)
  })

  it('versión exacta', () => {
    expect(satisfiesEngine('1.2.3', '1.2.3')).toBe(true)
    expect(satisfiesEngine('1.2.4', '1.2.3')).toBe(false)
  })

  it('OR con ||', () => {
    expect(satisfiesEngine('0.9.0', '>=1.0.0 || >=0.5.0')).toBe(true)
    expect(satisfiesEngine('0.1.0', '>=1.0.0 || >=0.5.0')).toBe(false)
  })

  it('sin constraint = compatible', () => {
    expect(satisfiesEngine('9.9.9', undefined)).toBe(true)
    // Constraint ilegible no bloquea (tolerancia CLI).
    expect(satisfiesEngine('0.1.0', 'basura')).toBe(true)
  })
})

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests de las revisiones de git.
 *
 * El caso real: un repo clonado puede tener una rama llamada
 * `--output=/home/usuario/.bashrc`. El panel Git usa la rama actual como ref
 * por defecto, así que `git log --output=…` sobrescribía el archivo. Estas
 * funciones son la barrera que impide que un `-` inicial llegue a git.
 */

import { describe, it, expect } from 'vitest'
import { isSafeDiffRef, isSafeRefName, isSafeRemoteName, isSafeRevision } from '../src/shared/git-ref'

describe('isSafeRefName', () => {
  it('acepta ramas y tags normales', () => {
    expect(isSafeRefName('main')).toBe(true)
    expect(isSafeRefName('feat/security-audit')).toBe(true)
    expect(isSafeRefName('v0.1.5')).toBe(true)
  })

  it('rechaza opciones de git', () => {
    expect(isSafeRefName('--output=/tmp/pwned')).toBe(false)
    expect(isSafeRefName('-D')).toBe(false)
  })

  it('rechaza sintaxis de revisión y rutas raras', () => {
    expect(isSafeRefName('a..b')).toBe(false)
    expect(isSafeRefName('main~1')).toBe(false)
    expect(isSafeRefName('main^{commit}')).toBe(false)
    expect(isSafeRefName('main\nrm -rf /')).toBe(false)
    expect(isSafeRefName('../escape')).toBe(false)
  })
})

describe('isSafeRevision', () => {
  it('acepta HEAD, SHAs y refs', () => {
    expect(isSafeRevision('HEAD')).toBe(true)
    expect(isSafeRevision('abc1234')).toBe(true)
    expect(isSafeRevision('origin/main')).toBe(true)
  })

  it('no acepta el nombre de rama malicioso del PoC', () => {
    expect(isSafeRevision('--output=/home/dev/.bashrc')).toBe(false)
    expect(isSafeRevision('--detach')).toBe(false)
  })
})

describe('isSafeDiffRef', () => {
  it('acepta un rango de dos revisiones', () => {
    expect(isSafeDiffRef('main..feature')).toBe(true)
    expect(isSafeDiffRef('HEAD...origin/main')).toBe(true)
  })

  it('rechaza rangos con una parte inyectable', () => {
    expect(isSafeDiffRef('main..--output=/tmp/x')).toBe(false)
    expect(isSafeDiffRef('--output=/tmp/x..main')).toBe(false)
    expect(isSafeDiffRef('a..b..c')).toBe(false)
  })
})

describe('isSafeRemoteName', () => {
  it('acepta nombres de remoto y rechaza opciones', () => {
    expect(isSafeRemoteName('origin')).toBe(true)
    expect(isSafeRemoteName('upstream-2')).toBe(true)
    expect(isSafeRemoteName('--upload-pack=evil')).toBe(false)
    expect(isSafeRemoteName('a b')).toBe(false)
  })
})

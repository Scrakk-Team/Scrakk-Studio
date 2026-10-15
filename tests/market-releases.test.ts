// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del resolver de releases de la tienda (partes puras).
 *
 * El caso que los motivó: el catálogo oficial vive en UN repo con varias
 * extensiones, cada una con su release (`<id>@<version>`). La "última release
 * del repo" es la de la última que se publicó, así que la tienda tiene que
 * buscar la release que trae SU asset — y la versión sale del sufijo del tag.
 */

import { describe, it, expect } from 'vitest'
import {
  findReleaseWithAsset,
  releaseVersion,
  parseRepoPath
} from '../src/main/market/releases'

describe('releaseVersion', () => {
  it('tag clásico con v', () => {
    expect(releaseVersion('v1.2.0')).toBe('1.2.0')
    expect(releaseVersion('V2.0.1')).toBe('2.0.1')
  })

  it('tag por extensión (`<id>@<version>`)', () => {
    expect(releaseVersion('halloween-themes@1.3.0')).toBe('1.3.0')
    expect(releaseVersion('canvas@10.2.3')).toBe('10.2.3')
  })

  it('tag por extensión con guión y v', () => {
    expect(releaseVersion('canvas-v1.0.0')).toBe('1.0.0')
  })

  it('sin tag usa el nombre de la release, y sin nada cae a 0.0.0', () => {
    expect(releaseVersion(null, 'v9.9.9')).toBe('9.9.9')
    expect(releaseVersion(null, null)).toBe('0.0.0')
    expect(releaseVersion('  ', '')).toBe('0.0.0')
  })
})

describe('findReleaseWithAsset', () => {
  const asset = (name: string): { name: string } => ({ name })

  it('se queda con la release que trae el asset (no con la última del repo)', () => {
    const releases = [
      { tag_name: 'canvas@1.0.0', assets: [asset('canvas.sef')] },
      { tag_name: 'halloween-themes@1.3.0', assets: [asset('halloween-themes.sef')] },
      { tag_name: 'v1.0.0', assets: [asset('exotic-themes.sef')] }
    ]

    const halloween = findReleaseWithAsset(releases, (release) =>
      release.assets.some((entry) => entry.name === 'halloween-themes.sef')
    )
    expect(halloween?.tag_name).toBe('halloween-themes@1.3.0')
    expect(releaseVersion(halloween?.tag_name)).toBe('1.3.0')
  })

  it('sin asset no hay release', () => {
    const releases = [{ tag_name: 'canvas@1.0.0', assets: [asset('canvas.sef')] }]
    expect(
      findReleaseWithAsset(releases, (release) =>
        release.assets.some((entry) => entry.name === 'no-existe.sef')
      )
    ).toBeNull()
  })
})

describe('parseRepoPath', () => {
  it('acepta github/gitlab y rechaza otros hosts', () => {
    expect(parseRepoPath('github', 'https://github.com/Scrakk-Team/extensions')).toBe(
      'Scrakk-Team/extensions'
    )
    expect(parseRepoPath('github', 'https://github.com/Scrakk-Team/extensions.git')).toBe(
      'Scrakk-Team/extensions'
    )
    expect(parseRepoPath('gitlab', 'https://gitlab.com/foo/bar')).toBe('foo/bar')
    expect(parseRepoPath('github', 'https://evil.example.com/foo/bar')).toBeNull()
  })
})

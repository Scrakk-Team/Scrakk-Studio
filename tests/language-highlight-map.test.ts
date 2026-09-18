import { beforeEach, describe, expect, it } from 'vitest'
import { tokensFromScopes } from '@services/extensions/types/languages/highlight'
import {
  getExtensionDir,
  forgetExtensionDir,
  resetExtensionDirs,
  resolvePackagePath,
  setExtensionDir
} from '@services/extensions/extensionDirs'

describe('tokensFromScopes', () => {
  const scopeSets = [
    ['source.zig', 'comment.line.double-slash.zig'],
    ['source.zig', 'keyword.control.zig'],
    ['source.zig', 'string.quoted.double.zig']
  ]

  it('resuelve cada stack de scope a un slot una sola vez', () => {
    const tokens = tokensFromScopes(scopeSets, [
      { line: 0, start: 0, end: 4, scopes: 1 },
      { line: 0, start: 5, end: 6, scopes: 0 },
      { line: 1, start: 0, end: 5, scopes: 2 },
      { line: 2, start: 0, end: 3, scopes: 0 }
    ])

    expect(tokens).toEqual([
      { line: 0, startChar: 0, length: 4, slot: 0 },
      { line: 0, startChar: 5, length: 1, slot: 3 },
      { line: 1, startChar: 0, length: 5, slot: 1 },
      { line: 2, startChar: 0, length: 3, slot: 3 }
    ])
  })

  it('un índice de scope inválido no rompe: cae al texto por defecto', () => {
    const tokens = tokensFromScopes(scopeSets, [{ line: 0, start: 0, end: 2, scopes: 99 }])
    expect(tokens).toEqual([{ line: 0, startChar: 0, length: 2, slot: 5 }])
  })

  it('un capture de tree-sitter se resuelve con la MISMA tabla', () => {
    const tokens = tokensFromScopes(
      [['@keyword'], ['@variable.parameter']],
      [
        { line: 0, start: 0, end: 2, scopes: 0 },
        { line: 0, start: 3, end: 4, scopes: 1 }
      ]
    )
    expect(tokens.map((token) => token.slot)).toEqual([0, 12])
  })

  it('sin tokens devuelve vacío', () => {
    expect(tokensFromScopes(scopeSets, [])).toEqual([])
  })
})

describe('rutas de paquete de una extensión', () => {
  beforeEach(() => {
    resetExtensionDirs()
  })

  it('une el directorio con la ruta relativa del manifest', () => {
    setExtensionDir('demo.language', '/tmp/extensions/demo.language')
    expect(resolvePackagePath('demo.language', 'syntaxes/demo.tmLanguage.json')).toBe(
      '/tmp/extensions/demo.language/syntaxes/demo.tmLanguage.json'
    )
    // El manifest puede escribir `./` o barras de Windows.
    expect(resolvePackagePath('demo.language', './syntaxes\\demo.json')).toBe(
      '/tmp/extensions/demo.language/syntaxes/demo.json'
    )
  })

  it('sin paquete registrado no hay ruta (y no se inventa una)', () => {
    expect(resolvePackagePath('desconocida', 'a.json')).toBeNull()
    expect(getExtensionDir('desconocida')).toBeUndefined()
  })

  it('una ruta con `..` se rechaza: es dato del manifest, no del usuario', () => {
    setExtensionDir('demo.language', '/tmp/extensions/demo.language')
    expect(resolvePackagePath('demo.language', '../../etc/passwd')).toBeNull()
  })

  it('al desinstalar se olvida el directorio', () => {
    setExtensionDir('demo.language', '/tmp/extensions/demo.language')
    forgetExtensionDir('demo.language')
    expect(resolvePackagePath('demo.language', 'a.json')).toBeNull()
  })
})

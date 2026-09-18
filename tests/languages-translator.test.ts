/**
 * Traductor VSIX → SEF `languages`.
 *
 * Es la pieza que hace que una extensión de lenguaje REAL de VS Code entre: el
 * kit tiene que salir con sus gramáticas, su configuración, sus snippets y sus
 * defaults, los assets tienen que copiarse con la ruta que el manifest
 * referencia, y lo que no se puede traducir tiene que quedar REPORTADO (no
 * desaparecer).
 */

import { describe, it, expect } from 'vitest'
import {
  detectLanguages,
  translateLanguages
} from '@shared/compatibility/vscode/translators/types/languages/languages'
import type { VsixFileEntry, VsixPackageJson } from '@shared/compatibility/types'

const encoder = new TextEncoder()
const file = (path: string, content = '{}'): VsixFileEntry => ({
  path,
  data: encoder.encode(content)
})

const manifest = (contributes: Record<string, unknown>): VsixPackageJson =>
  ({ name: 'demo-lang', publisher: 'demo', version: '1.0.0', contributes }) as VsixPackageJson

const opts = { extensionId: 'vscode-demo.demo-lang' }

describe('detectLanguages', () => {
  it('detecta cualquiera de las piezas del kit', () => {
    expect(detectLanguages(manifest({ languages: [{ id: 'rust' }] }))).toBe(true)
    expect(detectLanguages(manifest({ grammars: [{ scopeName: 'source.x' }] }))).toBe(true)
    expect(detectLanguages(manifest({ snippets: [{ language: 'x', path: 'x.json' }] }))).toBe(true)
    expect(detectLanguages(manifest({ configurationDefaults: { '[x]': {} } }))).toBe(true)
  })

  it('no detecta una extensión que no es de lenguaje', () => {
    expect(detectLanguages(manifest({ themes: [{}] }))).toBe(false)
    expect(detectLanguages({} as VsixPackageJson)).toBe(false)
  })
})

describe('translateLanguages', () => {
  const files = [
    file('language-configuration.json', '{ "comments": { "lineComment": "//" } }'),
    file('syntaxes/rust.tmLanguage.json', '{ "scopeName": "source.rust" }'),
    file('snippets/rust.json', '{ "print": { "prefix": "pr", "body": "println!" } }'),
    file('icons/rust-light.svg', '<svg/>'),
    file('icons/rust-dark.svg', '<svg/>')
  ]

  const full = manifest({
    languages: [
      {
        id: 'rust',
        aliases: ['Rust'],
        extensions: ['.rs'],
        filenames: ['Cargo.toml'],
        configuration: './language-configuration.json',
        icon: { light: './icons/rust-light.svg', dark: './icons/rust-dark.svg' }
      }
    ],
    grammars: [
      {
        language: 'rust',
        scopeName: 'source.rust',
        path: './syntaxes/rust.tmLanguage.json',
        embeddedLanguages: { 'meta.embedded.block.sql': 'sql' },
        tokenTypes: { 'string.quoted': 'string' }
      }
    ],
    snippets: [{ language: 'rust', path: './snippets/rust.json' }],
    semanticTokenScopes: [{ language: 'rust', scopes: { keyword: ['keyword.control.rust'] } }],
    configurationDefaults: { '[rust]': { 'editor.tabSize': 4 } }
  })

  it('junta TODO el kit en UNA contribución', () => {
    const { contributions } = translateLanguages(full, files, opts)
    expect(contributions).toHaveLength(1)
    const kit = contributions[0]
    expect(kit.id).toBe('rust')
    expect(kit.aliases).toEqual(['Rust'])
    expect(kit.extensions).toEqual(['.rs'])
    expect(kit.filenames).toEqual(['Cargo.toml'])
    expect(kit.configuration).toBe('language-configuration.json')
    expect(kit.icon).toEqual({ light: 'icons/rust-light.svg', dark: 'icons/rust-dark.svg' })
    expect(kit.configurationDefaults).toEqual({ 'editor.tabSize': 4 })
    expect(kit.snippets).toEqual([{ path: 'snippets/rust.json' }])
    expect(kit.semanticTokenScopes).toEqual([
      { language: 'rust', scopes: { keyword: ['keyword.control.rust'] } }
    ])
  })

  it('la gramática va como textMate con su scope, su path y sus mapas', () => {
    const { contributions } = translateLanguages(full, files, opts)
    const grammars = contributions[0].grammars as Array<Record<string, unknown>>
    expect(grammars).toHaveLength(1)
    expect(grammars[0]).toMatchObject({
      kind: 'textMate',
      scopeName: 'source.rust',
      path: 'syntaxes/rust.tmLanguage.json',
      embeddedLanguages: { 'meta.embedded.block.sql': 'sql' },
      tokenTypes: { 'string.quoted': 'string' }
    })
  })

  it('copia los assets con la ruta que el manifest referencia', () => {
    const { assets } = translateLanguages(full, files, opts)
    for (const path of [
      'language-configuration.json',
      'syntaxes/rust.tmLanguage.json',
      'snippets/rust.json',
      'icons/rust-light.svg',
      'icons/rust-dark.svg'
    ]) {
      expect(assets.has(path), `falta el asset ${path}`).toBe(true)
    }
  })

  it('reporta cada pieza con su soporte (y no esconde la que falta)', () => {
    const { mapped } = translateLanguages(full, files, opts)
    const bySource = new Map(mapped.map((entry) => [entry.source, entry]))
    expect(bySource.get('contributes.languages')?.support).toBe('full')
    expect(bySource.get('contributes.grammars')?.support).toBe('partial')
    expect(bySource.get('contributes.snippets')?.support).toBe('full')
    expect(bySource.get('contributes.semanticTokenScopes')?.support).toBe('partial')
  })

  it('un default global (sin [lenguaje]) se reporta en vez de perderse', () => {
    const withGlobal = manifest({
      languages: [{ id: 'rust' }],
      configurationDefaults: { 'editor.fontSize': 14, '[rust]': { 'editor.tabSize': 4 } }
    })
    const { mapped, contributions } = translateLanguages(withGlobal, files, opts)
    expect(mapped.some((entry) => entry.source.includes('editor.fontSize'))).toBe(true)
    expect(contributions[0].configurationDefaults).toEqual({ 'editor.tabSize': 4 })
  })

  it('una gramática que apunta a un lenguaje NO declarado se conserva como kit propio', () => {
    const orphan = manifest({
      grammars: [{ language: 'otro-lenguaje', scopeName: 'source.otro', path: './syntaxes/rust.tmLanguage.json' }]
    })
    const { contributions, mapped } = translateLanguages(orphan, files, opts)
    expect(contributions).toHaveLength(1)
    expect(contributions[0].id).toBe('otro-lenguaje')
    expect(mapped.some((entry) => entry.source.includes('lenguaje no declarado'))).toBe(true)
  })

  it('un asset que falta se reporta como `none` con su ruta', () => {
    const missing = manifest({
      languages: [{ id: 'rust', configuration: './no-existe.json' }],
      grammars: [{ language: 'rust', scopeName: 'source.rust', path: './nope.tmLanguage.json' }]
    })
    const { mapped, contributions } = translateLanguages(missing, files, opts)
    expect(contributions[0].configuration).toBeUndefined()
    expect(contributions[0].grammars).toBeUndefined()
    expect(mapped.filter((entry) => entry.support === 'none')).toHaveLength(2)
    expect(mapped.every((entry) => entry.support !== 'none' || Boolean(entry.note))).toBe(true)
  })

  it('una gramática plist XML se copia pero se avisa (el tokenizador lee JSON)', () => {
    const plist = manifest({
      languages: [{ id: 'x' }],
      grammars: [{ language: 'x', scopeName: 'source.x', path: './syntaxes/x.tmLanguage' }]
    })
    const withPlist = [...files, file('syntaxes/x.tmLanguage', '<?xml version="1.0"?><plist/>')]
    const { mapped, contributions } = translateLanguages(plist, withPlist, opts)
    expect((contributions[0].grammars as unknown[]).length).toBe(1)
    expect(mapped.some((entry) => entry.note?.includes('plist'))).toBe(true)
  })

  it('una gramática inyectada (sin `language`) se cuelga del lenguaje que extiende', () => {
    const injected = manifest({
      languages: [{ id: 'html' }],
      grammars: [
        { language: 'html', scopeName: 'text.html.basic', path: './syntaxes/html.tmLanguage.json' },
        { scopeName: 'source.css.embedded', path: './syntaxes/css.tmLanguage.json', injectTo: ['text.html.basic'] }
      ]
    })
    const withInjected = [
      ...files,
      file('syntaxes/html.tmLanguage.json', '{ "scopeName": "text.html.basic" }'),
      file('syntaxes/css.tmLanguage.json', '{ "scopeName": "source.css.embedded" }')
    ]
    const { contributions } = translateLanguages(injected, withInjected, opts)
    const grammars = contributions[0].grammars as Array<Record<string, unknown>>
    expect(grammars.map((g) => g.scopeName).sort()).toEqual(['source.css.embedded', 'text.html.basic'])
  })
})

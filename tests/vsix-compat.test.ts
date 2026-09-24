// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del pipeline VSIX → SEF:
 * - Traductor icons: iconPath → data URI embebida.
 * - convertVsix: manifest SEF puro + namespacing + coverage.
 */

import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { convertVsix } from '@shared/compatibility'
import { sniffFontFormat } from '@shared/compatibility/vscode/translators/types/product-icons/product-icons'
import { translateIconThemes } from '@shared/compatibility/vscode/translators/types/icons/icons'
import { extractVsix } from '@shared/compatibility'
import type { VsixFileEntry } from '@shared/compatibility'

const enc = new TextEncoder()

function u8(s: string): Uint8Array {
  return enc.encode(s)
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16"/></svg>'

function makeVsix(opts?: { noIcons?: boolean; brokenIcon?: boolean }): Uint8Array {
  const pkg = {
    name: 'material-icons',
    publisher: 'equinusocio',
    version: '1.0.0',
    displayName: 'Material Icons',
    engines: { vscode: '^1.80.0' },
    contributes: opts?.noIcons
      ? { snippets: [{ language: 'x', path: './snippets.json' }] }
      : {
          iconThemes: [{ id: 'material', label: 'Material', path: './icons/material.json' }]
        }
  }
  const theme = {
    iconDefinitions: {
      _file: { iconPath: './file.svg' },
      _ts: { iconPath: './ts.svg' },
      _broken: { iconPath: './missing.svg' }
    },
    fileExtensions: { ts: '_ts' },
    fileNames: { 'package.json': '_file' },
    file: '_file',
    folder: '_file'
  }
  const files: Record<string, Uint8Array> = {
    'extension/package.json': u8(JSON.stringify(pkg)),
    'extension/icons/material.json': u8(JSON.stringify(theme)),
    'extension/icons/file.svg': u8(SVG),
    'extension/icons/ts.svg': u8(SVG)
  }
  if (opts?.brokenIcon) {
    delete files['extension/icons/ts.svg']
  }
  return zipSync(files)
}

describe('extractVsix', () => {
  it('encuentra package.json con prefijo extension/', () => {
    const { manifest, files } = extractVsix(makeVsix())
    expect(manifest.name).toBe('material-icons')
    expect(files.length).toBeGreaterThan(3)
  })

  it('falla sin package.json', () => {
    expect(() => extractVsix(zipSync({ 'a.txt': u8('x') }))).toThrow(/package\.json/)
  })
})

describe('translateIconThemes', () => {
  it('embebe iconPaths como data URIs y omite rotos', () => {
    const { manifest, files } = extractVsix(makeVsix())
    const out = translateIconThemes(manifest, files as VsixFileEntry[], {
      extensionId: 'vscode-test'
    })
    expect(out.contributions).toHaveLength(1)
    expect(out.contributions[0].path).toMatch(/^icons\/.*\.json$/)
    const asset = JSON.parse(out.assets.get(out.contributions[0].path)!)
    expect(asset.iconDefinitions._file.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(asset.iconDefinitions._ts.startsWith('data:image/svg+xml;base64,')).toBe(true)
    // Roto → omitido, no tumba.
    expect(asset.iconDefinitions._broken).toBeUndefined()
    expect(asset.fileExtensions.ts).toBe('_ts')
  })
})

describe('convertVsix', () => {
  it('produce SEF puro con id namespaced y coverage 1', () => {
    const converted = convertVsix(makeVsix())
    expect(converted.id).toMatch(/^vscode-/)
    expect(converted.id).toContain('equinusocio.material-icons')
    const manifest = converted.manifest as Record<string, unknown>
    expect(manifest.id).toBe(converted.id)
    const contributes = manifest.contributes as Record<string, unknown[]>
    expect(contributes.fileIcons).toHaveLength(1)
    expect(converted.files.has('manifest.json')).toBe(true)
    expect(
      [...converted.files.keys()].some((k) => k.startsWith('icons/') && k.endsWith('.json'))
    ).toBe(true)
    expect(converted.report.coverage).toBe(1)
    expect(converted.report.warning).toBeNull()
  })

  it('sin iconThemes ni themes → ERROR honesto (no se instala vacío)', () => {
    expect(() => convertVsix(makeVsix({ noIcons: true }))).toThrow(/no puede convertirla/)
  })

  it('el error honesto dice QUÉ tipo es', () => {
    try {
      convertVsix(makeVsix({ noIcons: true }))
      expect.unreachable()
    } catch (error) {
      expect(String((error as Error).message)).toMatch(/Snippets/)
    }
  })

  it('el core SEF solo ve kinds traducidos (sin rastro vsix)', () => {
    const converted = convertVsix(makeVsix())
    const manifest = converted.manifest as Record<string, unknown>
    expect(Object.keys((manifest.contributes as Record<string, unknown>) ?? {})).toEqual([
      'fileIcons'
    ])
  })
})

describe('product icon themes (caso Carbon Product Icons)', () => {
  function makeProductVsix(): Uint8Array {
    const pkg = {
      name: 'carbon-product-icons',
      publisher: 'antfu',
      version: '0.1.0',
      displayName: 'Carbon Product Icons',
      contributes: {
        productIconThemes: [{ id: 'carbon', label: 'Carbon', path: './carbon.json' }]
      }
    }
    const theme = {
      fonts: [{ id: 'carbon', src: [{ path: './carbon.woff2', format: 'woff2' }] }],
      iconDefinitions: {
        files: { fontCharacter: '\\E001', fontId: 'carbon' },
        folder: { fontCharacter: '\\E002' }
      }
    }
    return zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/carbon.json': u8(JSON.stringify(theme)),
      'extension/carbon.woff2': u8('fake-font-bytes')
    })
  }

  it('convierte a SEF productIcons con fuentes embebidas', () => {
    const converted = convertVsix(makeProductVsix())
    expect(converted.id).toContain('antfu.carbon-product-icons')
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    expect(contributes.productIcons).toHaveLength(1)
    const assetPath = String(contributes.productIcons[0].path)
    const asset = JSON.parse(String(converted.files.get(assetPath)))
    expect(asset.iconDefinitions.files.fontCharacter).toBe('\\E001')
    expect(asset.fonts).toHaveLength(1)
    expect(asset.fonts[0].dataUri.startsWith('data:font/woff2;base64,')).toBe(true)
    expect(converted.report.coverage).toBe(1)
    expect(converted.report.warning).toBeNull()
  })
})

describe('color themes', () => {
  function makeThemeVsix(): Uint8Array {
    const pkg = {
      name: 'night-owl',
      publisher: 'sarah',
      version: '1.0.0',
      contributes: {
        themes: [{ label: 'Night Owl', uiTheme: 'vs-dark', path: './themes/night.json' }]
      }
    }
    // JSONC real: comentarios + trailing comma.
    const theme = `{
      // Night Owl
      "name": "Night Owl",
      "colors": {
        "editor.background": "#011627",
        "editor.foreground": "#d6deeb",
        "sideBar.background": "#011627",
        "activityBarBadge.background": "#007acc",
        "panel.border": "#5f7e9777",
      },
      "tokenColors": [
        { "scope": "comment", "settings": { "foreground": "#637777", "fontStyle": "italic" } }
      ]
    }`
    return zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/themes/night.json': u8(theme)
    })
  }

  it('traduce a SEF themes con type y colores mapeados', () => {
    const converted = convertVsix(makeThemeVsix())
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    expect(contributes.themes).toHaveLength(1)
    expect(contributes.themes[0].type).toBe('dark')
    const assetPath = String(contributes.themes[0].path)
    const asset = JSON.parse(String(converted.files.get(assetPath)))
    expect(asset.colors.bg).toBe('#011627')
    expect(asset.colors.text).toBe('#d6deeb')
    expect(asset.colors.accent).toBe('#007acc')
    // Alpha separado: panelBorder sólido + opacidad.
    expect(asset.colors.panelBorder).toBe('#5f7e97')
    expect(asset.colors.panelBorderOpacity).toBeGreaterThan(0)
    expect(asset.tokenColors[0]).toMatchObject({ scope: 'comment', foreground: '#637777', fontStyle: 'italic' })
    expect(converted.report.coverage).toBe(1)
  })
})

describe('validación (capa 1)', () => {
  it('basura que no es zip → error claro', () => {
    expect(() => convertVsix(u8('esto no es un zip'))).toThrow(/vsix válido|package\.json/i)
  })

  it('zip sin package.json → error claro', () => {
    expect(() => convertVsix(zipSync({ 'a.txt': u8('x') }))).toThrow(/package\.json/)
  })
})

describe('fuentes mentirosas (magic bytes mandan)', () => {
  it('sniffFontFormat corrige la extensión', () => {
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]) // wOF2
    const woff = new Uint8Array([0x77, 0x4f, 0x46, 0x46]) // wOFF
    const ttf = new Uint8Array([0x00, 0x01, 0x00, 0x00])
    const otf = new Uint8Array([0x4f, 0x54, 0x54, 0x4f]) // OTTO
    expect(sniffFontFormat(woff2, 'truetype')).toBe('woff2')
    expect(sniffFontFormat(woff, 'woff2')).toBe('woff')
    expect(sniffFontFormat(ttf, 'woff')).toBe('truetype')
    expect(sniffFontFormat(otf, 'woff')).toBe('opentype')
    expect(sniffFontFormat(u8('hola'), 'woff')).toBe('woff')
  })

  it('multi-src: si el primero falta, usa el segundo', () => {
    const pkg = {
      name: 'multi',
      publisher: 'p',
      version: '1.0.0',
      contributes: {
        productIconThemes: [{ id: 'm', label: 'M', path: './m.json' }]
      }
    }
    const theme = {
      fonts: [
        {
          id: 'f',
          src: [{ path: './missing.woff2' }, { path: './real.woff', format: 'woff' }]
        }
      ],
      iconDefinitions: { folder: { fontCharacter: '\\E001', fontId: 'f' } }
    }
    const vsix = zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/m.json': u8(JSON.stringify(theme)),
      'extension/real.woff': new Uint8Array([0x77, 0x4f, 0x46, 0x46, 1, 2, 3])
    })
    const converted = convertVsix(vsix)
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    expect(contributes.productIcons).toHaveLength(1)
    const asset = JSON.parse(String(converted.files.get(String(contributes.productIcons[0].path))))
    expect(asset.fonts).toHaveLength(1)
    expect(asset.fonts[0].format).toBe('woff')
    expect(asset.fonts[0].dataUri.startsWith('data:font/woff;base64,')).toBe(true)
  })
})

describe('surface sigue al tema (activitybars)', () => {
  it('tema mínimo: editor aparte, chrome coherente con defaults VS Code', () => {
    const pkg = {
      name: 'min',
      publisher: 'p',
      version: '1.0.0',
      contributes: {
        themes: [{ label: 'Min', uiTheme: 'vs-dark', path: './t.json' }]
      }
    }
    const theme = {
      colors: { 'editor.background': '#123456', 'editor.foreground': '#ffffff' }
    }
    const vsix = zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/t.json': u8(JSON.stringify(theme))
    })
    const converted = convertVsix(vsix)
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    const asset = JSON.parse(String(converted.files.get(String(contributes.themes[0].path))))
    expect(asset.colors.editorBg).toBe('#123456')
    expect(asset.colors.bg).toBe('#123456')
    // Sin sideBar.background: chrome con default Dark+.
    expect(asset.colors.surface).toBe('#252526')
    expect(asset.colors.activityBarBg).toBe('#252526')
    expect(asset.colors.titleBarBg).toBe('#252526')
    expect(asset.colors.statusBarBg).toBe('#252526')
  })

  it('tema estilo Dracula: cada zona del chrome con su color real', () => {
    const pkg = {
      name: 'dracula',
      publisher: 'dracula',
      version: '1.0.0',
      contributes: {
        themes: [{ label: 'Dracula', uiTheme: 'vs-dark', path: './dracula.json' }]
      }
    }
    const theme = {
      colors: {
        'editor.background': '#282a36',
        'editor.foreground': '#f8f8f2',
        'sideBar.background': '#21222c',
        'activityBar.background': '#343746',
        'titleBar.activeBackground': '#21222c',
        'statusBar.background': '#191a21',
        'list.hoverBackground': '#44475a'
      }
    }
    const vsix = zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/dracula.json': u8(JSON.stringify(theme))
    })
    const converted = convertVsix(vsix)
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    const asset = JSON.parse(String(converted.files.get(String(contributes.themes[0].path))))
    expect(asset.colors.editorBg).toBe('#282a36')
    expect(asset.colors.bg).toBe('#282a36')
    expect(asset.colors.surface).toBe('#21222c')
    expect(asset.colors.activityBarBg).toBe('#343746')
    expect(asset.colors.titleBarBg).toBe('#21222c')
    expect(asset.colors.statusBarBg).toBe('#191a21')
    expect(asset.colors.hover).toBe('#44475a')
  })

  it('Tokyo Night real: chrome unificado del tema, no aplanado al editor', () => {
    const pkg = {
      name: 'tokyo-night',
      publisher: 'enkia',
      version: '1.0.0',
      contributes: {
        themes: [{ label: 'Tokyo Night', uiTheme: 'vs-dark', path: './tokyo.json' }]
      }
    }
    const theme = {
      colors: {
        'editor.background': '#1a1b26',
        'sideBar.background': '#16161e',
        'activityBar.background': '#16161e',
        'titleBar.activeBackground': '#16161e',
        'statusBar.background': '#16161e',
        'tab.activeBackground': '#16161e'
      }
    }
    const vsix = zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/tokyo.json': u8(JSON.stringify(theme))
    })
    const converted = convertVsix(vsix)
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    const asset = JSON.parse(String(converted.files.get(String(contributes.themes[0].path))))
    // Fiel: todo el chrome en #16161e (así es el tema real).
    expect(asset.colors.activityBarBg).toBe('#16161e')
    expect(asset.colors.titleBarBg).toBe('#16161e')
    expect(asset.colors.statusBarBg).toBe('#16161e')
    // bg sigue al editor — no al chrome.
    expect(asset.colors.bg).toBe('#1a1b26')
    expect(asset.colors.editorBg).toBe('#1a1b26')
  })
})

describe('rutas reales de assets (absolutas, ../, escapes)', () => {
  function makeOddPathsVsix(): Uint8Array {
    const pkg = {
      name: 'odd-paths',
      publisher: 'p',
      version: '1.0.0',
      contributes: {
        iconThemes: [{ id: 'odd', label: 'Odd', path: './themes/odd.json' }],
        productIconThemes: [{ id: 'oddui', label: 'Odd UI', path: './themes/odd-ui.json' }]
      }
    }
    const icons = {
      iconDefinitions: {
        abs: { iconPath: '/themes/icons/a.svg' },
        dotdot: { iconPath: '../icons/b.svg' },
        backslash: { iconPath: '.\\icons\\c.svg' },
        escape: { iconPath: '../../../evil.svg' },
        missing: { iconPath: './nope.svg' }
      },
      file: 'abs',
      fileExtensions: { xxx: 'dotdot' }
    }
    const ui = {
      fonts: [{ id: 'f', src: [{ path: '/themes/fonts/g.woff2' }] }],
      iconDefinitions: { folder: { fontCharacter: '\\E001', fontId: 'f' } }
    }
    return zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/themes/odd.json': u8(JSON.stringify(icons)),
      'extension/themes/odd-ui.json': u8(JSON.stringify(ui)),
      'extension/themes/icons/a.svg': u8(SVG),
      'extension/icons/b.svg': u8(SVG),
      'extension/themes/icons/c.svg': u8(SVG),
      'extension/themes/fonts/g.woff2': new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3])
    })
  }

  it('resuelve absolutas, ../ y backslashes; el escape se descarta', () => {
    const converted = convertVsix(makeOddPathsVsix())
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    expect(contributes.fileIcons).toHaveLength(1)
    const asset = JSON.parse(String(converted.files.get(String(contributes.fileIcons[0].path))))
    expect(Object.keys(asset.iconDefinitions).sort()).toEqual(['abs', 'backslash', 'dotdot'])
    expect(asset.iconDefinitions.abs.startsWith('data:image/svg+xml;base64,')).toBe(true)
  })

  it('fuente con path absoluto se embebe', () => {
    const converted = convertVsix(makeOddPathsVsix())
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    expect(contributes.productIcons).toHaveLength(1)
    const asset = JSON.parse(String(converted.files.get(String(contributes.productIcons[0].path))))
    expect(asset.fonts).toHaveLength(1)
    expect(asset.fonts[0].dataUri.startsWith('data:font/woff2;base64,')).toBe(true)
  })

  it('tema sin iconos resolvibles no aporta contribución (no registra vacío)', () => {
    const pkg = {
      name: 'empty-icons',
      publisher: 'p',
      version: '1.0.0',
      contributes: {
        iconThemes: [
          { id: 'e', label: 'E', path: './e.json' },
          { id: 'ok', label: 'Ok', path: './ok.json' }
        ]
      }
    }
    const empty = { iconDefinitions: { ghost: { iconPath: './missing.svg' } }, file: 'ghost' }
    const ok = { iconDefinitions: { real: { iconPath: './real.svg' } }, file: 'real' }
    const vsix = zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/e.json': u8(JSON.stringify(empty)),
      'extension/ok.json': u8(JSON.stringify(ok)),
      'extension/real.svg': u8(SVG)
    })
    const converted = convertVsix(vsix)
    const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
    expect(contributes.fileIcons).toHaveLength(1)
    expect(String(contributes.fileIcons[0].id)).toContain('ok')
    const failed = converted.report.unsupported.filter((m) => m.source === 'iconThemes:e')
    expect(failed).toHaveLength(1)
    expect(failed[0].support).toBe('none')
  })
})

describe('resolveThemeAsset', () => {
  it('relativas, absolutas y escapes', async () => {
    const { resolveThemeAsset } = await import('@shared/compatibility')
    expect(resolveThemeAsset('./themes/odd.json', './a.svg')).toBe('themes/a.svg')
    expect(resolveThemeAsset('./themes/odd.json', 'a.svg')).toBe('themes/a.svg')
    expect(resolveThemeAsset('./themes/odd.json', '/icons/a.svg')).toBe('icons/a.svg')
    expect(resolveThemeAsset('./themes/odd.json', '../icons/b.svg')).toBe('icons/b.svg')
    expect(resolveThemeAsset('./themes/odd.json', '.\\icons\\c.svg')).toBe('themes/icons/c.svg')
    expect(resolveThemeAsset('odd.json', 'a.svg')).toBe('a.svg')
    // Escapes por encima de la raíz → null (se descartan).
    expect(resolveThemeAsset('./themes/odd.json', '../../../evil.svg')).toBeNull()
    expect(resolveThemeAsset('odd.json', '../evil.svg')).toBeNull()
    expect(resolveThemeAsset('./t.json', '')).toBeNull()
  })
})

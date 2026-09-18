/**
 * Tests de temas flat (One Dark Pro Flat y variantes): detección de chrome
 * monocromo, borde derivado, y que los temas con chrome rico NO se marquen.
 */

import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { convertVsix } from '@shared/compatibility'

const enc = new TextEncoder()
const u8 = (s: string): Uint8Array => enc.encode(s)

function makeThemeVsix(colors: Record<string, string>, label: string): Uint8Array {
  const pkg = {
    name: 'odp',
    publisher: 'zhuangtongfa',
    version: '1.0.0',
    contributes: { themes: [{ label, uiTheme: 'vs-dark', path: './t.json' }] }
  }
  return zipSync({
    'extension/package.json': u8(JSON.stringify(pkg)),
    'extension/t.json': u8(JSON.stringify({ colors }))
  })
}

function assetOf(converted: ReturnType<typeof convertVsix>): {
  flat?: boolean
  colors: Record<string, string>
} {
  const contributes = converted.manifest.contributes as Record<string, Array<Record<string, unknown>>>
  return JSON.parse(String(converted.files.get(String(contributes.themes[0].path))))
}

describe('temas flat', () => {
  it('One Dark Pro Flat real: chrome monocromo → flat + borde derivado del hover', () => {
    // Keys reales del vsix OneDark-Pro-flat.json.
    const vsix = makeThemeVsix(
      {
        'editor.background': '#282c34',
        'sideBar.background': '#282c34',
        'activityBar.background': '#282c34',
        'titleBar.activeBackground': '#282c34',
        'statusBar.background': '#282c34',
        'list.hoverBackground': '#2c313a',
        'activityBarBadge.background': '#21252b'
      },
      'One Dark Pro Flat'
    )
    const asset = assetOf(convertVsix(vsix))
    expect(asset.flat).toBe(true)
    expect(asset.colors.panelBorder).toBeDefined()
    // Derivado del hover #2c313a (+12% hacia blanco), no del fondo plano.
    expect(asset.colors.panelBorder).not.toBe('#282c34')
    expect(asset.colors.panelBorder).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('tema con chrome rico (Dracula) NO se marca flat', () => {
    const vsix = makeThemeVsix(
      {
        'editor.background': '#282a36',
        'sideBar.background': '#21222c',
        'activityBar.background': '#343746',
        'titleBar.activeBackground': '#21222c',
        'statusBar.background': '#191a21',
        'list.hoverBackground': '#44475a',
        'panel.border': '#191a21'
      },
      'Dracula'
    )
    const asset = assetOf(convertVsix(vsix))
    expect(asset.flat).toBeUndefined()
    // panelBorder propio del tema, no derivado.
    expect(asset.colors.panelBorder).toBe('#191a21')
  })

  it('tema sin keys de chrome → flat (usa defaults VS Code pero se marca)', () => {
    const vsix = makeThemeVsix(
      { 'editor.background': '#123456', 'editor.foreground': '#ffffff' },
      'Minimal'
    )
    const asset = assetOf(convertVsix(vsix))
    expect(asset.flat).toBe(true)
  })

  it('Tokyo Night (chrome unificado pero ≠ editor) → flat igual (un solo color)', () => {
    const vsix = makeThemeVsix(
      {
        'editor.background': '#1a1b26',
        'sideBar.background': '#16161e',
        'activityBar.background': '#16161e',
        'titleBar.activeBackground': '#16161e',
        'statusBar.background': '#16161e',
        'list.hoverBackground': '#292e42'
      },
      'Tokyo Night'
    )
    const asset = assetOf(convertVsix(vsix))
    expect(asset.flat).toBe(true)
    expect(asset.colors.panelBorder).toBeDefined()
  })
})

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * La CSP del webview de extensión debe ser inmune a los catálogos i18n.
 * Antes se armaba con `t('main.default.src.none')`: una traducción rota
 * invalidaba la política.
 */

import { describe, it, expect } from 'vitest'
import { bundleHostCsp, webviewCsp } from '../src/main/extensions/webviewCsp'

function directive(csp: string, name: string): string {
  const part = csp
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry === name || entry.startsWith(`${name} `))
  return part ?? ''
}

describe('webviewCsp', () => {
  it('siempre emite las directivas base, sin i18n', () => {
    const csp = webviewCsp('demo.ext')
    expect(directive(csp, 'default-src')).toBe("default-src 'none'")
    expect(directive(csp, 'frame-src')).toBe("frame-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'none'")
    expect(directive(csp, 'form-action')).toBe("form-action 'none'")
  })

  it('ata los assets al origen de ESA extensión', () => {
    const csp = webviewCsp('demo.ext')
    expect(directive(csp, 'script-src')).toContain('scrakk-ext://demo.ext')
    expect(directive(csp, 'connect-src')).toContain('scrakk-ext://demo.ext')
  })

  it('no filtra directivas entre extensiones', () => {
    expect(webviewCsp('a.ext')).not.toContain('b.ext')
  })
})


describe('bundleHostCsp — iframe del bundle aislado', () => {
  it('solo permite scripts del origen de la extensión y el inline del host', () => {
    const csp = bundleHostCsp('demo.ext')
    expect(directive(csp, 'script-src')).toContain('scrakk-ext://demo.ext')
    expect(directive(csp, 'script-src')).toContain("'unsafe-inline'")
    expect(directive(csp, 'frame-src')).toBe("frame-src 'none'")
    expect(directive(csp, 'connect-src')).toContain('https:')
  })
})

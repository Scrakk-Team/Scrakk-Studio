// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Un icono SVG de extensión se inyecta como HTML en la ActivityBar. Un SVG es
 * HTML: `onload`, `<script>` o `href="javascript:"` se ejecutan en el origen
 * del IDE.
 */

import { describe, it, expect } from 'vitest'
import { sanitizeSvgIcon } from '../src/renderer/src/services/extensions/svgIcon'

const OK = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="currentColor"/></svg>'

describe('sanitizeSvgIcon', () => {
  it('deja pasar un icono normal', () => {
    expect(sanitizeSvgIcon(OK)).toBe(OK)
  })

  it('elimina manejadores inline', () => {
    const out = sanitizeSvgIcon('<svg onload="fetch(`https://evil`)"><path onclick="x()" d="M0 0"/></svg>')
    expect(out).not.toContain('onload')
    expect(out).not.toContain('onclick')
    expect(out).toContain('<path')
  })

  it('elimina script, foreignObject, iframe y object', () => {
    const out = sanitizeSvgIcon(
      '<svg><script>alert(1)</script><foreignObject><iframe src="https://evil"></iframe></foreignObject><object data="x"></object><path d="M0 0"/></svg>'
    )
    expect(out).not.toContain('<script')
    expect(out).not.toContain('foreignObject')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<object')
    expect(out).toContain('<path')
  })

  it('elimina href/src externos y javascript:, conserva fragmentos', () => {
    const out = sanitizeSvgIcon(
      '<svg><a href="javascript:alert(1)"><path d="M0 0"/></a><use href="https://evil/x.svg#a"/><path href="#ok" d="M0 0"/></svg>'
    )
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('https://evil')
    expect(out).not.toContain('<use')
    expect(out).toContain('href="#ok"')
  })

  it('elimina atributos style (url()/CSS activo)', () => {
    const out = sanitizeSvgIcon('<svg><path style="fill:url(http://evil)" d="M0 0"/></svg>')
    expect(out).not.toContain('style=')
  })

  it('descarta el icono si queda un url() externo', () => {
    expect(sanitizeSvgIcon('<svg><path fill="url(http://evil/x)" d="M0 0"/></svg>')).toBeUndefined()
    expect(sanitizeSvgIcon('<svg><path fill="url(#grad)" d="M0 0"/></svg>')).toContain('url(#grad)')
  })

  it('descarta lo que no es un <svg>', () => {
    expect(sanitizeSvgIcon('<img src=x onerror=alert(1)>')).toBeUndefined()
    expect(sanitizeSvgIcon(undefined)).toBeUndefined()
    expect(sanitizeSvgIcon('')).toBeUndefined()
  })
})

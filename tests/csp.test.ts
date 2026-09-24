// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del Content-Security-Policy del renderer.
 *
 * Regresión real: sin `font-src ... data:`, el @font-face con data URIs que
 * inyecta el sistema de productIcons era bloqueado y NINGÚN glyph de .vsix
 * pintaba jamás (caída silenciosa a builtin/fallback). Los fileIcons no se
 * veían afectados (son <img>, cubiertos por `img-src data:`).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

function readCsp(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const html = fs.readFileSync(path.resolve(here, '..', 'src/renderer/index.html'), 'utf-8')
  const match = html.match(
    /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/
  )
  if (!match) throw new Error('CSP no encontrado en index.html')
  return match[1]
}

function directive(csp: string, name: string): string[] {
  const part = csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s === name || s.startsWith(`${name} `))
  if (!part) return []
  return part.split(/\s+/).slice(1)
}

describe('CSP del renderer', () => {
  it('font-src permite data: y https: (iconos embebidos + Google Fonts)', () => {
    const csp = readCsp()
    // Sin directiva propia heredaría default-src 'self' y bloquearía data:.
    const sources = directive(csp, 'font-src')
    expect(sources, 'font-src ausente: data: quedaría bloqueado').not.toEqual([])
    expect(sources).toContain('data:')
    expect(sources).toContain('https:')
  })

  it('style-src permite https: (stylesheets de Google Fonts)', () => {
    expect(directive(readCsp(), 'style-src')).toContain('https:')
  })

  it('img-src permite data: (fileIcons embebidos)', () => {
    expect(directive(readCsp(), 'img-src')).toContain('data:')
  })

  it('img-src permite scrakk-ext: (iconos de los árboles de extensiones)', () => {
    // Los `TreeItem.iconPath` apuntan a assets del paquete servidos por el
    // esquema de extensiones. Sin esto el árbol se ve sin iconos.
    expect(directive(readCsp(), 'img-src')).toContain('scrakk-ext:')
  })

  it('frame-src permite scrakk-ext: (paneles de extensiones)', () => {
    // Los paneles de la activity bar son iframes servidos por el esquema de
    // extensiones. Sin esta directiva caen en `default-src 'self'` y el
    // iframe no carga nunca (panel en blanco, sin error visible).
    expect(directive(readCsp(), 'frame-src')).toContain('scrakk-ext:')
  })
})

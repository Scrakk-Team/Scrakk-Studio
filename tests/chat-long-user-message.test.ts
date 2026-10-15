// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Mensaje del USUARIO largo: burbuja recortada + botón para expandir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * Un pegado largo (un log, un archivo) empujaba el chat una pantalla hacia
 * abajo. Lo que se rompe en silencio:
 *
 *   1. el recorte — basta con borrar la clase para que la burbuja vuelva a
 *      crecer sin tope,
 *   2. la MEDICIÓN — si el botón sale por cantidad de caracteres en vez de
 *      por desborde real, aparece en mensajes cortos que no había nada que
 *      expandir, y
 *   3. los textos — una clave i18n sin traducir sale como la clave cruda.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const BUBBLE = 'src/renderer/src/features/chat/components/MessageBubble/MessageBubble.tsx'
const CSS = 'src/renderer/src/features/chat/components/MessageBubble/MessageBubble.module.css'

describe('la burbuja del usuario se recorta', () => {
  it('el recorte es un line-clamp con su "…"', () => {
    const css = read(CSS)
    expect(css).toMatch(/\.userTextClamped\s*\{/)
    expect(css).toContain('-webkit-line-clamp')
    expect(css).toContain('-webkit-box-orient')
    expect(css).toContain('overflow: hidden')
  })

  it('el recorte va en un span interno (un ítem de flex no clampa)', () => {
    const src = read(BUBBLE)
    // `.userText` es el ítem de flex; el recorte tiene que ir DENTRO.
    expect(src).toMatch(/<span className=\{styles\.userText\}>/)
    expect(src).toContain('styles.userTextClamped')
    expect(src).toContain('userTextRef')
  })
})

describe('el botón sale por DESBORDE, no por largo del texto', () => {
  it('se mide el alto real contra el recortado', () => {
    const src = read(BUBBLE)
    expect(src).toContain('el.scrollHeight > el.clientHeight')
    // No hay umbral de caracteres decidiendo el botón.
    expect(src).not.toMatch(/content\.length\s*>/)
  })

  it('expandir y contraer cambian el mismo estado', () => {
    const src = read(BUBBLE)
    expect(src).toContain('setExpanded((prev) => !prev)')
    expect(src).toContain('aria-expanded={expanded}')
    // Al expandir el ítem salta a flex-end (queda junto al "…").
    expect(read(CSS)).toMatch(/\.expandBtn[\s\S]*align-self: flex-end/)
  })
})

describe('los textos salen traducidos, no como la clave', () => {
  it('chat.expandir y chat.contraer existen en los dos catálogos', () => {
    const es = JSON.parse(read('src/shared/i18n/catalogs/es/chat.json')) as Record<string, string>
    const en = JSON.parse(read('src/shared/i18n/catalogs/en/chat.json')) as Record<string, string>
    expect(es['chat.expandir']).toBeTruthy()
    expect(es['chat.contraer']).toBeTruthy()
    expect(en['chat.expandir']).toBeTruthy()
    expect(en['chat.contraer']).toBeTruthy()
  })
})

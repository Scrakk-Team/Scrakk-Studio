// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del tooling de docs: front-matter → nav (index.json / llms.txt).
 * Se prueban las funciones puras del builder (sin renderizar HTML).
 */

import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  slugFor,
  groupFor,
  firstHeading,
  firstParagraph,
  extractHeadings,
  slugifyAnchor,
  navOf,
  yamlString
} from '../tools/docs/build.mjs'

describe('parseFrontmatter', () => {
  it('separa datos y cuerpo', () => {
    const raw = '---\ntitle: "Manifest"\ngroup: extensions\norder: 60\n---\n\n# Manifest\n\nHola.\n'
    const { data, body } = parseFrontmatter(raw)
    expect(data.title).toBe('Manifest')
    expect(data.group).toBe('extensions')
    expect(data.order).toBe('60')
    expect(body.trimStart()).toBe('# Manifest\n\nHola.\n')
  })

  it('sin front-matter devuelve el cuerpo intacto', () => {
    const { data, body } = parseFrontmatter('# Hola\n')
    expect(data).toEqual({})
    expect(body).toBe('# Hola\n')
  })

  it('parsea arrays en flujo', () => {
    const { data } = parseFrontmatter('---\nrelated: ["a/b", "c"]\n---\n')
    expect(data.related).toEqual(['a/b', 'c'])
  })
})

describe('slugFor', () => {
  it('README raíz → índice', () => {
    expect(slugFor('README.md')).toBe('')
  })
  it('README de área → el área', () => {
    expect(slugFor('extensions/README.md')).toBe('extensions')
    expect(slugFor('lsp/README.md')).toBe('lsp')
  })
  it('archivo de área', () => {
    expect(slugFor('extensions/manifest.md')).toBe('extensions/manifest')
  })
  it('anidado', () => {
    expect(slugFor('extensions/panels/header-actions.md')).toBe('extensions/panels/header-actions')
  })
})

describe('groupFor', () => {
  it('archivo raíz → start', () => {
    expect(groupFor('updates.md')).toBe('start')
    expect(groupFor('README.md')).toBe('start')
  })
  it('carpeta conocida → su id', () => {
    expect(groupFor('extensions/manifest.md')).toBe('extensions')
    expect(groupFor('changelog/changelog-0.1.2.md')).toBe('changelog')
  })
  it('carpeta desconocida → start', () => {
    expect(groupFor('raro/x.md')).toBe('start')
  })
})

describe('extracción de texto', () => {
  it('firstHeading', () => {
    expect(firstHeading('intro\n\n# Título\n\ncuerpo')).toBe('Título')
  })
  it('firstParagraph salta encabezados, código y tablas', () => {
    const body = '# H\n\n```js\nno\n```\n\n| a | b |\n\nEsto es el resumen. Más texto.\n'
    expect(firstParagraph(body)).toBe('Esto es el resumen. Más texto.')
  })
  it('firstParagraph limpia marcas inline y recorta', () => {
    const p = firstParagraph(`# H\n\nUsa \`code\` y [un link](http://x) **fuerte**.`)
    expect(p).toBe('Usa code y un link fuerte.')
  })
  it('extractHeadings ignora bloques de código', () => {
    const body = '# A\n\n```\n## dentro del code\n```\n\n## B\n\n### C\n'
    expect(extractHeadings(body).map((h) => `${h.depth}:${h.text}`)).toEqual(['1:A', '2:B', '3:C'])
  })
  it('slugifyAnchor quita acentos y símbolos', () => {
    expect(slugifyAnchor('Configuración de ruta (v2)')).toBe('configuracion-de-ruta-v2')
  })
})

describe('navOf', () => {
  const docs = [
    { slug: 'extensions/manifest', group: 'extensions', order: 60, title: 'Manifest', summary: 's', rel: 'extensions/manifest.md' },
    { slug: '', group: 'start', order: 0, title: 'Inicio', summary: 's', rel: 'README.md' },
    { slug: 'extensions/README', group: 'extensions', order: 10, title: 'Extensiones', summary: 's', rel: 'extensions/README.md' }
  ]

  it('ordena grupos por order y descarta los vacíos', () => {
    const nav = navOf(docs)
    expect(nav.map((g) => g.id)).toEqual(['start', 'extensions'])
  })

  it('ordena items por order', () => {
    const ext = navOf(docs).find((g) => g.id === 'extensions')!
    expect(ext.items.map((i) => i.slug)).toEqual(['extensions/README', 'extensions/manifest'])
  })

  it('no incluye cuerpos markdown en la nav', () => {
    const nav = navOf(docs) as Array<Record<string, unknown>>
    expect(JSON.stringify(nav)).not.toContain('"markdown"')
  })
})

describe('yamlString', () => {
  it('escapa comillas y backslashes', () => {
    expect(yamlString('dice "hola" y \\')).toBe('"dice \\"hola\\" y \\\\"')
  })
})

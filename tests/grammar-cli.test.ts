/**
 * Tests del CLI de gramáticas (`tools/grammar.mjs`) — la parte de QUERIES.
 *
 * Lo que se candadea acá no es cosmético: el fallo histórico no era un error sino
 * un silencio. El paquete se instalaba sin `folds.scm` y el editor plegaba por
 * sangría sin que nadie supiera por qué. Estas funciones deciden qué archivo gana
 * cada categoría, de dónde sale y si produce el dato que el IDE espera.
 *
 * Son puras a propósito (los suplementos entran como texto), así que se testean
 * sin red.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  CONSUMED_CATEGORIES,
  HYBRID_CATEGORY_SOURCES,
  SUPPLEMENT_CATEGORIES,
  SUPPLEMENTS,
  declaredInherits,
  defaultOverridesDir,
  engineCopyFilter,
  engineQueryNames,
  engineRegistryEntry,
  originLabel,
  planQueries,
  queryFiles,
  renderQueryReport,
  repoNameFor,
  resolveInheritChain,
  supplementNamesFor,
  supplementUrls,
  verifyQueries
} from '../tools/grammar.mjs'

const upstream = (relative: string, content = '(identifier) @variable') => ({ relative, content })

describe('planQueries — upstream, ajustes propios y suplementos', () => {
  it('sin suplementos: instala lo del repo y declara lo que falta', () => {
    const plan = planQueries({
      files: [upstream('queries/highlights.scm'), upstream('queries/highlights-jsx.scm'), upstream('queries/tags.scm')]
    })

    expect(plan.entries.map((entry) => entry.relative)).toEqual([
      'queries/highlights-jsx.scm',
      'queries/highlights.scm',
      'queries/tags.scm'
    ])
    expect(plan.entries.every((entry) => entry.source === 'upstream')).toBe(true)
    // Lo que el repo no publica queda listado: el IDE cae a su alternativa y el
    // reporte lo dice en vez de dejar creer que el dato existe.
    expect(plan.missing).toEqual(['folds', 'injections', 'locals', 'textobjects', 'indents', 'rainbows'])
  })

  it('el ajuste propio PISA al del repo (es nuestro y existe para eso)', () => {
    const plan = planQueries({
      files: [upstream('queries/highlights.scm', 'del repo')],
      overrides: [{ path: '/engine/deps/queries-overrides/rust/highlights.scm', category: 'highlights', content: 'propio' }]
    })

    const highlights = plan.entries.filter((entry) => entry.category === 'highlights')
    expect(highlights).toHaveLength(1)
    expect(highlights[0].content).toBe('propio')
    expect(highlights[0].source).toBe('override')
  })

  it('un suplemento cacheado conserva su procedencia (licencia incluida)', () => {
    const plan = planQueries({
      files: [upstream('queries/highlights.scm')],
      overrides: [
        {
          path: '/engine/deps/queries-overrides/rust/tags.scm',
          category: 'tags',
          content: '(x) @definition.function',
          origin: 'helix',
          ref: '079a789e8cb08ead67f19e1971a1b7438b37354b',
          license: 'MPL-2.0'
        }
      ],
      categories: ['highlights', 'tags']
    })
    const tags = plan.entries.find((entry) => entry.category === 'tags')
    expect(tags).toMatchObject({
      source: 'override',
      origin: 'helix',
      ref: '079a789e8cb08ead67f19e1971a1b7438b37354b',
      license: 'MPL-2.0'
    })
    expect(originLabel(tags)).toBe('helix@079a789e')
  })

  it('el suplemento completa sólo lo que falta, con procedencia', () => {
    const plan = planQueries({
      files: [upstream('queries/highlights.scm')],
      supplements: [
        { category: 'folds', content: '(function_declaration) @fold', origin: 'nvim-treesitter', ref: 'abc1234', license: 'Apache-2.0' },
        { category: 'locals', content: '(function_declaration) @local.scope', origin: 'nvim-treesitter', ref: 'abc1234', license: 'Apache-2.0' }
      ],
      categories: ['highlights', 'folds', 'locals', 'tags']
    })

    expect(plan.missing).toEqual(['tags'])
    const folds = plan.entries.find((entry) => entry.category === 'folds')
    expect(folds).toMatchObject({
      relative: 'queries/folds.scm',
      source: 'supplement',
      origin: 'nvim-treesitter',
      ref: 'abc1234',
      license: 'Apache-2.0'
    })
    // `highlights` ya venía del repo: el suplemento no lo pisa ni se duplica.
    expect(plan.entries.filter((entry) => entry.category === 'highlights')).toHaveLength(1)
  })

  it('lo que se instala sin consumidor se marca (hoy: indents y lo desconocido)', () => {
    const plan = planQueries({
      files: [upstream('queries/highlights.scm'), upstream('queries/mi-query-rara.scm')],
      supplements: [{ category: 'indents', content: '(block) @indent.begin', origin: 'nvim-treesitter', ref: 'abc1234' }],
      categories: ['highlights', 'indents']
    })

    expect(plan.entries.some((entry) => entry.category === 'unknown')).toBe(true)
    expect(plan.entries.some((entry) => entry.category === 'indents')).toBe(true)
    expect(plan.unconsumed).toEqual(expect.arrayContaining(['indents', 'unknown']))
    expect(plan.unconsumed).not.toContain('highlights')
  })

  it('el orden del reporte es estable (no depende del orden del repo)', () => {
    const plan = planQueries({
      files: [upstream('queries/tags.scm'), upstream('queries/highlights.scm')],
      supplements: [{ category: 'folds', content: '(x) @fold', origin: 'nvim-treesitter', ref: 'abc1234' }],
      categories: ['highlights', 'folds']
    })

    expect(plan.entries.map((entry) => entry.category)).toEqual(['highlights', 'tags', 'folds'])
  })

  it('las categorías instaladas por defecto son las consumidas + indents + rainbows', () => {
    expect(SUPPLEMENT_CATEGORIES).toEqual([...CONSUMED_CATEGORIES, 'indents', 'rainbows'])
    // `rainbows` se instala sin consumidor todavía (el consumidor de brackets no
    // existe); `indents` sí lo tiene (auto-indent del motor).
    expect(CONSUMED_CATEGORIES).not.toContain('rainbows')
  })

  it('el híbrido elige catálogo por categoría (nvim / helix / textobjects)', () => {
    // Medido: nvim gana highlights, injections, locals, folds e indents.
    expect(HYBRID_CATEGORY_SOURCES.highlights).toEqual(['nvim', 'helix'])
    expect(HYBRID_CATEGORY_SOURCES.injections).toEqual(['nvim', 'helix'])
    expect(HYBRID_CATEGORY_SOURCES.locals).toEqual(['nvim', 'helix'])
    expect(HYBRID_CATEGORY_SOURCES.folds).toEqual(['nvim', 'helix'])
    expect(HYBRID_CATEGORY_SOURCES.indents).toEqual(['nvim', 'helix'])
    // Helix es el único con tags y rainbows; en textobjects respalda al repo
    // dedicado (sus `.inside/.around` se normalizan en el IDE).
    expect(HYBRID_CATEGORY_SOURCES.tags).toEqual(['helix'])
    expect(HYBRID_CATEGORY_SOURCES.rainbows).toEqual(['helix'])
    expect(HYBRID_CATEGORY_SOURCES.textobjects).toEqual(['textobjects', 'helix'])
    // Cada catálogo va fijado por commit y declara su licencia.
    for (const id of ['nvim', 'helix', 'textobjects'] as const) {
      expect(SUPPLEMENTS[id].ref).toMatch(/^[0-9a-f]{40}$/)
      expect(SUPPLEMENTS[id].license).toMatch(/^(Apache-2\.0|MPL-2\.0)$/)
    }
    expect(SUPPLEMENTS.helix.license).toBe('MPL-2.0')
    expect(SUPPLEMENTS.textobjects.license).toBe('Apache-2.0')
    // Helix cubre terraform con las queries de hcl.
    expect(SUPPLEMENTS.helix.aliases).toEqual({ terraform: 'hcl' })
  })
})

describe('renderQueryReport', () => {
  it('dice de dónde salió cada categoría y qué no se pudo traer', () => {
    const plan = planQueries({
      files: [upstream('queries/highlights.scm')],
      supplements: [{ category: 'folds', content: '(x) @fold', origin: 'nvim-treesitter', ref: '9a168f6357ed21c3a636e1727bc7d382abc451b8' }],
      categories: ['highlights', 'folds', 'indents']
    })
    const lines = renderQueryReport(plan)
    const text = lines.join('\n')

    expect(text).toContain('2 archivo(s) ← 1 del repo, 0 ajuste(s) propio(s), 1 suplemento(s)')
    expect(text).toContain('queries/highlights.scm ← repo')
    expect(text).toContain('queries/folds.scm ← nvim-treesitter@9a168f63')
    expect(text).toContain('✗ indents')
  })

  it('avisa cuando una categoría se instala sin consumidor', () => {
    const plan = planQueries({
      files: [upstream('queries/highlights.scm')],
      supplements: [{ category: 'indents', content: '(block) @indent.begin', origin: 'nvim-treesitter', ref: 'abc1234' }],
      categories: ['highlights', 'indents']
    })
    expect(renderQueryReport(plan).join('\n')).toContain('sin consumidor todavía')
  })
})

describe('verifyQueries — 0 captures es una instalación rota', () => {
  it('acepta un folds.scm con @fold', () => {
    const [row] = verifyQueries([{ relative: 'queries/folds.scm', category: 'folds', content: '(function_declaration) @fold' }])
    expect(row.ok).toBe(true)
    expect(row.captures).toBe(1)
  })

  it('rechaza un folds.scm que no pliega (el caso que nadie veía)', () => {
    const [row] = verifyQueries([{ relative: 'queries/folds.scm', category: 'folds', content: '; comentario nomás\n' }])
    expect(row.ok).toBe(false)
    expect(row.detail).toBe('sin captures')
  })

  it('rechaza una query con captures pero del tipo equivocado', () => {
    const [row] = verifyQueries([{ relative: 'queries/folds.scm', category: 'folds', content: '(comment) @comment' }])
    expect(row.ok).toBe(false)
    expect(row.detail).toBe('no tiene los captures que el IDE espera')
  })

  it('conoce la forma de cada categoría (nvim incluido)', () => {
    const rows = verifyQueries([
      { relative: 'queries/indents.scm', category: 'indents', content: '["{"] @indent.begin' },
      { relative: 'queries/tags.scm', category: 'tags', content: '(function_declaration name: (identifier) @definition.function)' },
      { relative: 'queries/locals.scm', category: 'locals', content: '(function_declaration) @local.scope' },
      { relative: 'queries/injections.scm', category: 'injections', content: '(comment) @injection.content\n(#set! injection.language "js")' },
      { relative: 'queries/highlights.scm', category: 'highlights', content: '(identifier) @variable' }
    ])
    expect(rows.every((row) => row.ok)).toBe(true)
  })
})

describe('suplementos', () => {
  it('prueba los dos layouts del catálogo (cambió en 2025) y el nombre con guion bajo', () => {
    expect(supplementNamesFor('c-sharp')).toEqual(['c-sharp', 'c_sharp'])
    const urls = supplementUrls(SUPPLEMENTS.nvim, { name: 'c_sharp', category: 'folds' })
    expect(urls).toEqual([
      `https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/${SUPPLEMENTS.nvim.ref}/runtime/queries/c_sharp/folds.scm`,
      `https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/${SUPPLEMENTS.nvim.ref}/queries/c_sharp/folds.scm`
    ])
  })

  it('el catálogo va fijado a un commit, no a una rama', () => {
    expect(SUPPLEMENTS.nvim.ref).toMatch(/^[0-9a-f]{40}$/)
    expect(SUPPLEMENTS.nvim.license).toBe('Apache-2.0')
  })
})

describe('herencia de queries — la cadena completa, no un nivel', () => {
  it('resuelve en cadena (tsx → typescript → javascript)', () => {
    const files = {
      typescript: '; inherits: javascript\n(interface_declaration) @fold',
      javascript: '["``" (template_string)] @injection.content'
    }
    const resolved = resolveInheritChain(files.typescript, (base) => files[base] ?? null)

    expect(resolved).toContain('@fold')
    expect(resolved).toContain('@injection.content')
    // La directiva se consume: el archivo instalado es autocontenido y el motor
    // no tiene que conocer el nombre de la base del catálogo.
    expect(resolved).not.toMatch(/^\s*;\s*inherits:/m)
  })

  it('el suplemento stub de nvim (sólo la directiva) deja de ser un archivo vacío', () => {
    const files = { ecma: '[(function_declaration)] @fold', jsx: '(jsx_element) @fold' }
    const stub = '; inherits: ecma,jsx\n'
    expect(declaredInherits(stub)).toEqual(['ecma', 'jsx'])
    const resolved = resolveInheritChain(stub, (base) => files[base] ?? null)
    expect(verifyQueries([{ relative: 'queries/folds.scm', category: 'folds', content: resolved }])[0].ok).toBe(true)
  })

  it('no entra en bucle si la cadena se muerde la cola, y aguanta una base ausente', () => {
    const files = { a: '; inherits: b\n(a) @fold', b: '; inherits: a\n(b) @fold' }
    const resolved = resolveInheritChain(files.a, (base) => files[base] ?? null)
    expect(resolved.match(/@fold/g)?.length).toBeGreaterThanOrEqual(1)
    expect(resolveInheritChain('; inherits: no_existe\n(x) @fold', () => null)).toContain('@fold')
  })
})

describe('queryFiles — los tres layouts reales', () => {
  /** Cada test con su propio repo de mentira: nadie limpia lo del vecino. */
  const withRepo = (files: string[]) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grammar-queries-'))
    for (const relative of files) {
      const full = path.join(root, relative)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, '(x) @variable')
    }
    return root
  }

  it('encuentra las queries de un parser anidado con carpeta propia (markdown)', () => {
    // Sin esto, markdown se instalaba SIN queries del repo y los suplementos
    // pisaban su highlights en silencio.
    const root = withRepo(['tree-sitter-markdown/queries/highlights.scm', 'tree-sitter-markdown/queries/injections.scm'])
    expect(queryFiles(root, 'tree-sitter-markdown/src').map((f) => f.relative)).toEqual([
      path.join('queries', 'highlights.scm'),
      path.join('queries', 'injections.scm')
    ])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('encuentra las queries por lenguaje de un monorepo (tsx)', () => {
    const root = withRepo(['queries/tsx/highlights.scm', 'queries/typescript/highlights.scm'])
    expect(queryFiles(root, 'tsx/src').map((f) => f.relative)).toEqual([path.join('queries', 'highlights.scm')])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('encuentra las del caso normal y no inventa una ruta cuando no hay ninguna', () => {
    const root = withRepo(['queries/highlights.scm'])
    expect(queryFiles(root, 'src').map((f) => f.relative)).toEqual([path.join('queries', 'highlights.scm')])
    fs.rmSync(root, { recursive: true, force: true })

    const empty = withRepo(['src/parser.c'])
    expect(queryFiles(empty, 'src')).toEqual([])
    fs.rmSync(empty, { recursive: true, force: true })
  })
})

describe('repoNameFor — el nombre del repo tiene que ser el REAL', () => {
  it('de un checkout local usa su carpeta, no el id del lenguaje', () => {
    // `tree-sitter-${language}` daba `tree-sitter-c_sharp` ≠ `tree-sitter-c-sharp`,
    // y como el registry se busca por repoName, eso creaba una entrada nueva y el
    // lenguaje desaparecía del wasm.
    expect(repoNameFor('c_sharp', { kind: 'dir', path: '/e/deps/languages/tree-sitter-c-sharp' })).toBe(
      'tree-sitter-c-sharp'
    )
    expect(repoNameFor('markdown', { kind: 'dir', path: '/e/deps/languages/tree-sitter-markdown' })).toBe(
      'tree-sitter-markdown'
    )
  })

  it('de un repo git usa el slug; de un wasm/npm cae al nombre por lenguaje', () => {
    expect(repoNameFor('gleam', { kind: 'git', slug: 'gleam-lang/tree-sitter-gleam' })).toBe('tree-sitter-gleam')
    expect(repoNameFor('gleam', { kind: 'wasm' })).toBe('tree-sitter-gleam')
    expect(repoNameFor('gleam', { kind: 'dir', path: '/tmp/algo' })).toBe('tree-sitter-gleam')
  })
})

describe('engine — rutas y registry', () => {
  const root = '/repo'

  it('no copia lo que el build en C no usa, pero sí los hermanos del parser', () => {
    const filter = engineCopyFilter(root)
    expect(filter('/repo')).toBe(true)
    expect(filter('/repo/src/parser.c')).toBe(true)
    expect(filter('/repo/queries/highlights.scm')).toBe(true)
    // tree-sitter-typescript incluye ../../common/scanner.h: un whitelist de
    // "sólo src/" rompería el build.
    expect(filter('/repo/common/scanner.h')).toBe(true)
    expect(filter('/repo/typescript/src/parser.c')).toBe(true)
    expect(filter('/repo/node_modules/x/y.js')).toBe(false)
    expect(filter('/repo/test/corpus/x.txt')).toBe(false)
    expect(filter('/repo/bindings/rust/lib.rs')).toBe(false)
    expect(filter('/repo/.github/workflows/ci.yml')).toBe(false)
  })

  it('las queries se listan relativas a queries/', () => {
    expect(engineQueryNames([{ relative: 'queries/highlights.scm' }, { relative: 'queries/tree-sitter-markdown/highlights.scm' }])).toEqual([
      'highlights.scm',
      'tree-sitter-markdown/highlights.scm'
    ])

    const entry = engineRegistryEntry({
      language: 'gleam',
      repoName: 'tree-sitter-gleam',
      repoUrl: 'https://github.com/gleam-lang/tree-sitter-gleam',
      queries: [{ relative: 'queries/highlights.scm' }, { relative: 'queries/folds.scm' }],
      hasScannerC: true,
      hasScannerCC: false
    })
    expect(entry.queries).toEqual(['highlights.scm', 'folds.scm'])
    expect(entry.active).toBe(true)
  })

  it('los ajustes propios viven donde el engine los busca, o en dist/ sin checkout', () => {
    const withEngine = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-'))
    fs.mkdirSync(path.join(withEngine, 'deps', 'queries-overrides'), { recursive: true })
    expect(defaultOverridesDir({ engineDir: withEngine, projectRoot: '/proj', symbol: 'rust' })).toBe(
      path.join(withEngine, 'deps', 'queries-overrides', 'rust')
    )
    expect(defaultOverridesDir({ engineDir: '/no/existe', projectRoot: '/proj', symbol: 'rust' })).toBe(
      path.join('/proj', 'dist', 'grammars', 'queries-overrides', 'rust')
    )
    fs.rmSync(withEngine, { recursive: true, force: true })
  })

  it('la etiqueta de origen es la que se audita después', () => {
    expect(originLabel({ source: 'upstream' })).toBe('repo')
    expect(originLabel({ source: 'override' })).toBe('ajuste propio')
    expect(originLabel({ source: 'supplement', origin: 'nvim-treesitter', ref: 'abc1234567' })).toBe('nvim-treesitter@abc12345')
    // Suplemento cacheado: en disco ya es "ajuste propio", pero conserva su
    // catálogo y su commit (si no, el pack saldría sin licencia).
    expect(originLabel({ source: 'override', origin: 'helix', ref: 'abc1234567' })).toBe('helix@abc12345')
  })
})

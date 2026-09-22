#!/usr/bin/env node
/**
 * Compila CADA lenguaje a su propio wasm y lo deja en `langs/<id>/`.
 *
 * No recompila el motor: usa los checkouts que ya están en
 * `$ENGINE/deps/languages` y llama al CLI (`tools/grammar.mjs --target langs`)
 * una vez por lenguaje. Cada carpeta queda con:
 *
 *   langs/<id>/manifest.json       → declaración del lenguaje (extensiones, parser, queries)
 *   langs/<id>/grammar.json        → procedencia (fuente, ABI, sha256, origen de cada query)
 *   langs/<id>/grammars/<id>.wasm  → parser individual
 *   langs/<id>/queries/*.scm       → highlights, folds, injections, tags, locals, textobjects
 *   langs/index.json               → lista de lenguajes disponibles (lo lee el IDE)
 *
 * Uso:
 *   source ~/emsdk/emsdk_env.sh        # hace falta emcc
 *   node tools/build-langs.mjs [outDir]        (default: ./langs)
 *
 * Variables:
 *   INNERTA_ENGINE=<dir>   checkout del motor (default: ../InnertaEngine/InnertaEngine-Linux)
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE =
  process.env.INNERTA_ENGINE ?? join(ROOT, '..', 'InnertaEngine', 'InnertaEngine-Linux')
const LANGS_SRC = join(ENGINE, 'deps', 'languages')

const ARGS = process.argv.slice(2)
const PACK_ONLY = ARGS.includes('--pack-only')
const OUT_ARG = ARGS.find((a) => !a.startsWith('--'))
const OUT = OUT_ARG ? resolve(OUT_ARG) : join(ROOT, 'langs')

/**
 * Casos que no son `tree-sitter-<id>` en la raíz: sub-parsers de un monorepo o
 * dialectos. `parser` es el `--parser` del CLI; `force` saltea la verificación
 * de queries (dart trae un `test.scm` sin captures).
 */
const SPECIAL = {
  typescript: { dir: 'tree-sitter-typescript/typescript' },
  tsx: { dir: 'tree-sitter-typescript/tsx' },
  php: { dir: 'tree-sitter-php/php' },
  markdown: { dir: 'tree-sitter-markdown/tree-sitter-markdown' },
  terraform: { dir: 'tree-sitter-hcl/dialects/terraform' },
  yaml: { dir: 'tree-sitter-yaml', parser: 'src' },
  hcl: { dir: 'tree-sitter-hcl', parser: 'src' },
  dart: { dir: 'tree-sitter-dart', force: true }
}

/** id → extensiones, leídas de la ÚNICA fuente del IDE (`languages.ts`). */
function readLanguages() {
  const app = readFileSync(join(ROOT, 'src/renderer/src/features/editor/languages.ts'), 'utf8')
  const re =
    /\{\s*(?:\/\/[^\n]*\s*)*id:\s*'([^']+)',\s*name:\s*'[^']*',\s*extensions:\s*\[([^\]]*)\](?:,\s*filenames:\s*\[([^\]]*)\])?\s*\}/g
  const out = []
  let m
  while ((m = re.exec(app))) {
    const exts = m[2]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
    const files = (m[3] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
    out.push({ id: m[1], ext: [...exts.map((e) => `.${e}`), ...files].join(',') })
  }
  return out
}

const registry = JSON.parse(readFileSync(join(ENGINE, 'deps', 'languages.json'), 'utf8'))
const repoByName = new Map(registry.languages.map((l) => [l.name, l.repoName]))

const targets = readLanguages().map(({ id, ext }) => {
  const special = SPECIAL[id]
  return {
    id,
    ext,
    dir: special?.dir ?? repoByName.get(id) ?? `tree-sitter-${id}`,
    parser: special?.parser,
    force: special?.force
  }
})

/**
 * Compone el manifiesto de PACK (`langs/manifest.json`) a partir de los
 * manifiestos por lenguaje: `langs/` es UNA extensión con N lenguajes.
 * Se puede correr solo con `--pack-only` (no recompila nada).
 */
function writePackManifest() {
  const languages = []
  for (const target of targets) {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(OUT, target.id, 'manifest.json'), 'utf8'))
    } catch {
      continue
    }
    const decl = manifest.contributes?.languages?.[0]
    const grammar = decl?.grammars?.[0]
    if (!decl || !grammar) continue
    languages.push({
      id: decl.id,
      aliases: decl.aliases ?? [decl.id],
      extensions: decl.extensions ?? [],
      grammars: [
        {
          kind: 'treeSitter',
          parser: `${decl.id}/${grammar.parser}`,
          queries: (grammar.queries ?? []).map((q) => `${decl.id}/${q}`),
          ...(grammar.abi ? { abi: grammar.abi } : {}),
          ...(grammar.sha256 ? { sha256: grammar.sha256 } : {})
        }
      ]
    })
  }
  languages.sort((a, b) => a.id.localeCompare(b.id))
  const pack = {
    id: 'scrakk.langs',
    name: 'Lenguajes (tree-sitter)',
    version: '1.0.0',
    author: 'scrakk-grammar',
    description: 'Gramáticas tree-sitter, una por lenguaje, cargadas on-demand.',
    contributes: { languages }
  }
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(pack, null, 2)}\n`)
  console.log(`pack: ${join(OUT, 'manifest.json')} (${languages.length} lenguajes)`)
}

if (PACK_ONLY) {
  writePackManifest()
  process.exit(0)
}

console.log(`${targets.length} lenguajes → ${OUT}\n`)

let ok = 0
let fail = 0
for (const target of targets) {
  const args = [
    join(ROOT, 'tools', 'grammar.mjs'),
    join(LANGS_SRC, target.dir),
    '--name',
    target.id,
    '--ext',
    target.ext,
    '--target',
    'langs',
    '--out',
    OUT
  ]
  if (target.parser) args.push('--parser', target.parser)
  if (target.force) args.push('--force')
  try {
    execFileSync(process.execPath, args, { stdio: 'pipe' })
    ok += 1
    console.log(`  OK    ${target.id}`)
  } catch (error) {
    fail += 1
    const text = `${error.stdout?.toString() ?? ''}${error.stderr?.toString() ?? ''}`
    const detail = text.trim().split('\n').slice(-2).join(' | ').slice(0, 200)
    console.log(`  FALLO ${target.id}: ${detail}`)
  }
}

console.log(`\n=== ${ok} OK, ${fail} fallos`)
process.exitCode = fail > 0 ? 1 : 0

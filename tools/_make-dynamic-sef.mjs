/**
 * Empaqueta un `.sef` de LENGUAJE con parser tree-sitter (`kind: 'treeSitter'`).
 *
 * Lo usa el probe del camino dinámico: un paquete SEF de verdad (zip, como lo
 * produce `tools/sef`), con su `.wasm` y sus queries `.scm`, para que el main lo
 * cargue en el worker y el editor pinte con él.
 *
 * Trae TODAS las categorías de query, no sólo `highlights`: es lo que permite
 * verificar en la app compilada que el árbol entrega símbolos (outline),
 * plegado, alcances (ir a la definición), objetos de texto y una inyección de
 * otro lenguaje.
 *
 *   node tools/_make-dynamic-sef.mjs <parser.wasm> [salida.sef]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { zipSync } from 'fflate'

const parserPath = process.argv[2]
const outPath = process.argv[3] ?? '/tmp/scrakk-dynamic-lang.sef'
if (!parserPath) {
  console.error('falta la ruta del parser .wasm')
  process.exit(2)
}

const manifest = {
  id: 'probe.dynamiclang',
  name: 'Probe Dynamic Language',
  version: '1.0.0',
  author: 'probe',
  contributes: {
    languages: [
      {
        id: 'dynjs',
        aliases: ['Dynamic JS'],
        extensions: ['dynjs'],
        // Un lenguaje con gramática tree-sitter DINÁMICA: el parser se carga en
        // el proceso aparte desde el `.wasm` del paquete.
        grammars: [
          {
            kind: 'treeSitter',
            parser: 'grammars/dynjs.wasm',
            queries: [
              'queries/highlights.scm',
              'queries/tags.scm',
              'queries/folds.scm',
              'queries/locals.scm',
              'queries/textobjects.scm',
              'queries/injections.scm'
            ],
            abi: 'tree-sitter-abi-15'
          }
        ]
      }
    ]
  }
}

const highlights = `
(function_declaration name: (identifier) @function)
(call_expression function: (identifier) @function.call)
(variable_declarator name: (identifier) @variable)
(string) @string
(number) @number
(true) @constant.builtin
(comment) @comment
["function" "const" "return" "let"] @keyword
`

// Símbolos para el OUTLINE (convención de tags: `@definition.X` + `@name`).
const tags = `
(function_declaration name: (identifier) @name) @definition.function
(variable_declarator name: (identifier) @name) @definition.variable
`

// Plegado por ÁRBOL. El `program` entero se pliega para que el rango no
// dependa de la indentación (que es lo que el motor ya sabe hacer solo).
const folds = `
(program) @fold
(function_declaration) @fold
(array) @fold
`

// Alcances: definiciones y referencias, con el scope de la función.
const locals = `
(program) @local.scope
(function_declaration) @local.scope
(function_declaration name: (identifier) @local.definition)
(formal_parameters (identifier) @local.definition)
(variable_declarator name: (identifier) @local.definition)
(call_expression function: (identifier) @local.reference)
`

// Objetos de texto: el cuerpo de la función y la lista.
const textobjects = `
(function_declaration) @function.outer
(function_declaration body: (statement_block) @function.inner)
(array) @array.outer
`

// Inyección: el contenido de un template string es CSS.
const injections = `
(template_string (string_fragment) @injection.content
  (#set! injection.language "css"))
`

const files = {
  'manifest.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  'grammars/dynjs.wasm': new Uint8Array(readFileSync(parserPath)),
  'queries/highlights.scm': new TextEncoder().encode(highlights),
  'queries/tags.scm': new TextEncoder().encode(tags),
  'queries/folds.scm': new TextEncoder().encode(folds),
  'queries/locals.scm': new TextEncoder().encode(locals),
  'queries/textobjects.scm': new TextEncoder().encode(textobjects),
  'queries/injections.scm': new TextEncoder().encode(injections)
}

const zipped = zipSync(files)
writeFileSync(outPath, zipped)
console.log(
  `sef generado: ${outPath} (${zipped.length} bytes) — queries: ${manifest.contributes.languages[0].grammars[0].queries.length}`
)

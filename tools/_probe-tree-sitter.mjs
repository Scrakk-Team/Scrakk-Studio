/**
 * Probe del worker COMPILADO de tree-sitter dinámico (`out/main/tree-sitter-worker.js`).
 *
 * Verifica lo que un test de unidades no puede: que el bundle de producción
 * levante el runtime wasm (`require.resolve('web-tree-sitter/...')`), cargue un
 * parser real del disco y devuelva tokens con scopes.
 *
 * Uso:
 *   npm run build
 *   node tools/_probe-tree-sitter.mjs /ruta/al/tree-sitter-javascript.wasm
 */

import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const parserSource = process.argv[2]
if (!parserSource) {
  console.error('falta la ruta del parser .wasm (ej. package/wasm/tree-sitter-javascript.wasm)')
  process.exit(2)
}

const root = mkdtempSync(join(tmpdir(), 'scrakk-ts-probe-'))
mkdirSync(join(root, 'grammars'), { recursive: true })
mkdirSync(join(root, 'queries'), { recursive: true })
copyFileSync(parserSource, join(root, 'grammars', 'javascript.wasm'))
writeFileSync(
  join(root, 'queries', 'highlights.scm'),
  `
(function_declaration name: (identifier) @function)
(variable_declarator name: (identifier) @variable)
(string) @string
(number) @number
(comment) @comment
["function" "const" "return"] @keyword
`
)

// El worker espera `process.parentPort` (lo pone Electron en utilityProcess).
const messages = []
let resolveDone
const done = new Promise((resolve) => {
  resolveDone = resolve
})
process.parentPort = {
  on(_event, listener) {
    process.parentPort.listener = listener
  },
  postMessage(message) {
    messages.push(message)
    resolveDone(message)
  }
}

await import('../out/main/tree-sitter-worker.js')

const text = 'const total = 42 // cuenta\nfunction sumar(a) { return "hola" }\n'
process.parentPort.listener({
  data: {
    id: 1,
    type: 'tokenize',
    payload: {
      languageId: 'javascript',
      parserPath: join(root, 'grammars', 'javascript.wasm'),
      queries: [{ file: join(root, 'queries', 'highlights.scm'), category: 'highlights' }],
      text
    }
  }
})

const response = await done
console.log('respuesta ok:', response.ok, response.ok ? '' : response.error)
const result = response.result ?? {}
console.log('queries aplicadas:', result.applied?.length, '· queries rotas:', result.failed?.length)
console.log('scopeSets:', result.scopeSets?.length, '· tokens:', result.tokens?.length)

const byScope = new Map()
for (const token of result.tokens ?? []) {
  const scopes = result.scopeSets[token.scopes]
  const key = scopes.join(' ')
  byScope.set(key, (byScope.get(key) ?? 0) + 1)
}
console.log('scopes vistos:', [...byScope.entries()].map(([k, v]) => `${k}×${v}`).join(' · '))

const expected = ['keyword', 'variable', 'number', 'comment', 'string', 'function']
const missing = expected.filter((scope) => ![...byScope.keys()].some((key) => key.includes(scope)))
if (!response.ok || missing.length > 0) {
  console.error('FALLO: faltan scopes', missing)
  process.exit(1)
}
console.log('OK: el worker compilado tokeniza con el parser real del paquete')
process.exit(0)

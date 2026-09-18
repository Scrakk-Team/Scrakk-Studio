/**
 * Probe: qué diagnostica el server REAL de HTML (`vscode-html-language-server`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * Para probar el subrayado de errores en un `.html` hay que saber QUÉ mutación
 * produce un `publishDiagnostics` — y con qué severidad. Adivinarlo lleva a
 * "no aparece nada" sin saber si el problema es el canal o la mutación. Esto
 * habla el protocolo LSP a mano (framing `Content-Length`, sin dependencias),
 * abre un documento por variante y muestra lo que el server contesta.
 *
 * Uso:  node tools/_probe-html-diagnostics.mjs [archivo.html]
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LANG = process.env.PROBE_LANG ?? 'html'
const SERVERS = {
  html: 'vscode-html-language-server',
  css: 'vscode-css-language-server',
  json: 'vscode-json-language-server',
  yaml: 'yaml-language-server',
  typescript: 'typescript-language-server'
}
const BIN =
  process.env.PROBE_BIN ??
  join(process.env.HOME ?? '/root', '.scrakk/lsp/npm/node_modules/.bin/' + (SERVERS[LANG] ?? SERVERS.html))
const SRC = process.argv[2]

const BASE = SRC && existsSync(SRC)
  ? readFileSync(SRC, 'utf8')
  : '<!DOCTYPE html>\n<html>\n<body>\n  <div class="a">\n    <p>hola</p>\n  </div>\n</body>\n</html>\n'

/** Variantes a probar. La primera es el archivo tal cual (control). */
/** Variantes para TypeScript (el caso que SÍ reporta). */
function tsVariants(base) {
  return [
    ['control (sin tocar)', base],
    ['error de SINTAXIS (const a = ;)', base.replace('export const fin = 1', 'const a = ;')],
    ['error de TIPO (string = number)', base.replace('export const fin = 1', 'const s: string = 1')],
    ['propiedad inexistente', base.replace('export const fin = 1', 'const o = { a: 1 }; o.b')],
    ['variable sin usar (NO es error)', base.replace('export const fin = 1', 'const sinUsar = 3')]
  ]
}

const BASE_TS = 'export const fin = 1\n'

/** Variantes para JSON (el server de JSON SÍ valida, a diferencia del de HTML). */
const JSON_VARIANTS = [
  ['control (válido)', '{\n  "a": 1\n}\n'],
  ['falta el valor', '{\n  "a":\n}\n'],
  ['coma de más', '{\n  "a": 1,\n}\n'],
  ['comilla sin cerrar', '{\n  "a": "hola\n}\n'],
  ['falta una llave', '{\n  "a": 1\n']
]

/**
 * Con un archivo CSS explícito, se analiza ESE archivo (copiado a /tmp, nunca
 * se escribe el original): sirve para preguntarle al server real "¿este archivo
 * que el usuario tiene abierto reporta algo?".
 */
const CSS_FILE_VARIANTS =
  LANG === 'css' && SRC && existsSync(SRC)
    ? [['el archivo real, tal cual está en disco', readFileSync(SRC, 'utf8')]]
    : null

const CSS_VARIANTS = CSS_FILE_VARIANTS ?? [
  ['control (válido)', '.a {\n  color: red;\n}\n'],
  ['valor vacío', '.a {\n  color: ;\n}\n'],
  ['llave sin cerrar', '.a {\n  color: red;\n'],
  ['propiedad sin valor', '.a { color }\n'],
  // Rango VACÍO en una línea que EXISTE y no es el final del archivo: es el
  // caso que hay que poder dibujar (el de EOF cae en una línea inexistente).
  ['falta ; en medio', '.caja {\n  color: red\n  margin: 0;\n}\n'],
  ['paréntesis sin cerrar', '.caja {\n  color: rgb(0, 0;\n  padding: 1px;\n}\n'],
  ['comilla sin cerrar', '.caja {\n  content: "hola;\n  padding: 1px;\n}\n'],
  ['dos puntos de más', '.caja {\n  color: :: red;\n  padding: 1px;\n}\n']
]

const VARIANTS =
  LANG === 'typescript'
    ? tsVariants(BASE_TS)
    : LANG === 'json'
      ? JSON_VARIANTS
      : LANG === 'css'
        ? CSS_VARIANTS
        : [
  ['control (sin tocar)', BASE],
  ['falta un </div> (etiqueta sin cerrar)', BASE.replace(/<\/div>\n<\/body>/, '</body>')],
  ['click mal cerrado (</div> donde va </header>)', BASE.replace(/<\/header>/, '</div>')],
  ['anidado inválido (<div> dentro de <p>)', BASE.replace('<p>hola</p>', '<p><div>hola</div></p>')],
  ['atributo sin cerrar (class="a)', BASE.replace('class="a"', 'class="a')],
  ['etiqueta inventada (<pepito>)', BASE.replace('<p>hola</p>', '<pepito>hola</pepito>')],
  ['fin de etiqueta huérfano (</section>)', `${BASE}</section>\n`],
  ['JS ROTO dentro de <script>', BASE.replace('</body>', '  <script>const a = ;</script>\n</body>')],
  ['CSS ROTO dentro de <style>', BASE.replace('</head>', '  <style>.a { color: }</style>\n</head>')],
  ['atributo DESCONOCIDO (<div pepito="1">)', BASE.replace('class="a"', 'class="a" pepito="1"')],
  ['etiqueta ANIDADA MAL (<b><i></b></i>)', BASE.replace('<p>hola</p>', '<b><i>hola</b></i>')],
  ['nada de html (texto suelto + <)', BASE.replace('<p>hola</p>', 'hola < div')]
]

if (!existsSync(BIN)) {
  console.error(`no encuentro el server de HTML: ${BIN}`)
  process.exit(1)
}

const child = spawn(BIN, ['--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] })
child.stderr.on('data', (c) => process.stderr.write(`[server] ${c}`))

/** Escribe un mensaje LSP con framing `Content-Length`. */
function send(message) {
  const body = JSON.stringify({ jsonrpc: '2.0', ...message })
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

/** Diagnósticos por URI (lo último que publicó el server). */
const diagnostics = new Map()
const waiters = []

let buffer = Buffer.alloc(0)
child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return
    const header = buffer.subarray(0, headerEnd).toString('utf8')
    const match = /Content-Length: (\d+)/i.exec(header)
    if (!match) return
    const length = Number(match[1])
    const start = headerEnd + 4
    if (buffer.length < start + length) return
    const body = buffer.subarray(start, start + length).toString('utf8')
    buffer = buffer.subarray(start + length)
    handle(JSON.parse(body))
  }
})

function handle(message) {
  if (process.env.PROBE_VERBOSE === '1') {
    const kind = message.method ?? `respuesta id=${message.id}`
    const detail = message.method
      ? JSON.stringify(message.params ?? {}).slice(0, 160)
      : JSON.stringify(message.result ?? message.error ?? {}).slice(0, 700)
    console.log(`[←] ${kind}  ${detail}`)
  }
  if (message.method === 'workspace/configuration') {
    // Se contesta por SECCIÓN (el server pide la suya); contestar cualquier
    // cosa deja al server con settings inválidos y sin diagnósticos.
    send({
      id: message.id,
      // Se contesta por SECCIÓN: cada server espera SU forma de
      // `validate` (html: {scripts,styles}; json/js: {enable}; css: booleano).
      result: (message.params?.items ?? []).map((item) => {
        const section = String(item?.section ?? '')
        if (section === 'html') return { validate: { scripts: true, styles: true } }
        if (section === 'css' || section === 'scss' || section === 'less') return { validate: true }
        if (section === 'javascript' || section === 'typescript' || section === 'json')
          return { validate: { enable: true } }
        return {}
      })
    })
    return
  }
  if (message.id !== undefined && replies.has(message.id)) {
    replies.get(message.id)(message.result ?? message.error)
    replies.delete(message.id)
    return
  }
  if (message.id === 1 && message.result) {
    // ¿El server EMPUJA (`publishDiagnostics`) o se lo PIDE el cliente?
    console.log(
      '[init] diagnosticProvider=' +
        JSON.stringify(message.result.capabilities?.diagnosticProvider ?? null)
    )
    return
  }
  if (message.method === 'textDocument/publishDiagnostics') {
    if (process.env.PROBE_VERBOSE === '1') {
      console.log(
        `[← publish] ${message.params.uri} → ${message.params.diagnostics?.length ?? 0} diagnósticos`
      )
    }
    diagnostics.set(message.params.uri, message.params.diagnostics ?? [])
    const waiter = waiters.shift()
    if (waiter) waiter()
    return
  }
  if (message.method === 'window/showMessageRequest') {
    send({ id: message.id, result: null })
    return
  }
  if (message.method === 'workspace/configuration') {
    // El server pide sus ajustes: se contestan los defaults de VS Code.
    send({
      id: message.id,
      result: (message.params?.items ?? []).map(() => ({
        validate: { scripts: true, styles: true },
        suggest: { html5: true },
        format: { enable: true },
        useDefaultDataProvider: true
      }))
    })
    return
  }
  if (message.method === 'window/showMessage') return
  if (message.method === 'window/logMessage') return
  if (message.id !== undefined && message.method) {
    // Request del server: contestar `null` evita que se cuelgue.
    send({ id: message.id, result: null })
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Requests del cliente al server (initialize, textDocument/diagnostic…). */
const replies = new Map()
let requestId = 0
function request(id, method, params) {
  send({ id, method, params })
  return new Promise((resolve) => {
    replies.set(id, resolve)
    setTimeout(() => resolve(undefined), 2500)
  })
}
void requestId

async function main() {
  send({
    id: 1,
    method: 'initialize',
    params: {
      processId: process.pid,
      rootUri: `file://${process.cwd()}`,
      capabilities: {
        workspace: { configuration: true },
        textDocument: {
          publishDiagnostics: { relatedInformation: false },
          synchronization: { didSave: true, dynamicRegistration: false }
        }
      },
      workspaceFolders: null,
      // Escape hatch del server de TS: de dónde sacar `tsserver.js`. Con TS 7
      // (el port nativo) el paquete ya no trae ese archivo y el server ABORTA
      // el initialize; apuntarlo a un TS que sí lo tenga es la diferencia
      // entre tener diagnósticos y ninguno.
      ...(process.env.PROBE_TSDK
        ? { initializationOptions: { tsserver: { path: process.env.PROBE_TSDK } } }
        : {})
    }
  })
  await wait(700)
  send({ method: 'initialized', params: {} })
  // Ajustes explícitos: si el server espera configuración del cliente y no la
  // recibe, algunas validaciones quedan apagadas (y parecería que "no reporta").
  send({
    method: 'workspace/didChangeConfiguration',
    params: { settings: { html: { validate: { scripts: true, styles: true } } } }
  })
  await wait(500)

  const suffix = LANG === 'typescript' ? 'ts' : LANG === 'css' ? 'css' : LANG === 'json' ? 'json' : 'html'
  // Los archivos se ESCRIBEN de verdad: un server que trabaja sobre el disco
  // (tsserver lee el proyecto) ignora un `didOpen` de una ruta que no existe, y
  // eso se ve exactamente igual que "no reporta nada".
  const uris = VARIANTS.map(([, text], index) => {
    const file = `/tmp/probe-${LANG}-diagnostics-${index}.${suffix}`
    writeFileSync(file, text)
    const uri = `file://${file}`
    send({
      method: 'textDocument/didOpen',
      params: {        textDocument: { uri, languageId: LANG, version: 1, text } }
    })
    return uri
  })

  // El server valida en cada didOpen; se le da margen antes de leer.
  await wait(2500)

  // Camino PULL: si el server declara `diagnosticProvider`, los diagnósticos no
  // se empujan solos: se piden con `textDocument/diagnostic`.
  const pulled = new Map()
  for (const [index, uri] of uris.entries()) {
    const answer = await request(100 + index, 'textDocument/diagnostic', {
      textDocument: { uri },
      identifier: 'html',
      previousResultId: null
    })
    if (process.env.PROBE_VERBOSE === '1') {
      console.log(`[pull] ${uri} → ${answer?.items?.length ?? String(answer?.message ?? answer?.code ?? 'nada')}`)
    }
    if (answer?.items) pulled.set(uri, answer.items)
  }

  let failures = 0
  VARIANTS.forEach(([label], index) => {
    const list = diagnostics.get(uris[index]) ?? pulled.get(uris[index]) ?? []
    console.log(`\n── ${label}`)
    if (list.length === 0) {
      console.log('   (sin diagnósticos: NO sirve para probar el subrayado)')
      if (index > 0) failures += 1
      return
    }
    for (const diag of list) {
      const severity = { 1: 'Error', 2: 'Advertencia', 3: 'Info', 4: 'Hint' }[diag.severity] ?? '?'
      const { start, end } = diag.range
      const empty = start.line === end.line && start.character === end.character
      console.log(
        `   ${severity.padEnd(11)} · línea ${start.line + 1}:${start.character} → ${end.line + 1}:${end.character}` +
          `${empty ? '  [RANGO VACÍO]' : ''} → ${diag.message}` +
          (diag.code ? `  [${diag.code}]` : '')
      )
    }
  })

  console.log(
    `\n${failures === 0 ? 'todas las variantes dieron diagnósticos' : `${failures} variante(s) sin diagnósticos`}`
  )
  child.kill('SIGKILL')
}

void main()

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Descubrimiento: qué API `vscode` toca `vscode-languageclient` de verdad.
 *
 * La pregunta que responde: si bundleamos la lib REAL, ¿cuánta superficie del
 * API hay que darle al Extension Host para que un `LanguageClient` arranque?
 *
 * No adivina: instala un `require('vscode')` grabador, instancia un client
 * contra un server stdio mínimo y lista (a) cada miembro tocado, (b) cada
 * llamada, (c) el primer punto donde el shim artificial NO alcanza.
 *
 *   node tools/_probe-languageclient.mjs
 */

import { createRequire } from 'node:module'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fork } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const require_ = createRequire(join(root, 'package.json'))

const touched = new Set()
const calls = []

function record(path, kind) {
  const key = `${kind} ${path}`
  if (!touched.has(key)) touched.add(key)
}

/** Disposable/proxy genérico: todo devuelve otro proxy. */
function makeProxy(path, name = 'vscode') {
  const target = function () {}
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => `[${path}]`
      if (prop === 'then') return undefined
      if (typeof prop === 'symbol') return undefined
      const next = `${path}.${String(prop)}`
      record(next, 'get')
      return makeProxy(next)
    },
    apply(_t, _this, args) {
      record(path, 'call')
      calls.push(`${path}(${args.map((a) => typeof a).join(',')})`)
      return makeProxy(`${path}()`, path)
    },
    construct(_t, args) {
      record(path, 'new')
      return makeProxy(`${path}#`, path)
    },
    has() {
      return true
    }
  })
}

// `Uri.file` es lo primero que usa la lib en el selector: se implementa para
// que no se pierda el flujo por una tontería.
class FakeUri {
  constructor(scheme, path) {
    this.scheme = scheme
    this.path = path
  }
  static file(p) {
    record('Uri.file', 'call')
    return new FakeUri('file', p)
  }
  static parse(v) {
    return new FakeUri('file', String(v))
  }
  static joinPath(base, ...segs) {
    return new FakeUri(base.scheme, [base.path, ...segs].join('/'))
  }
  get fsPath() {
    return this.path
  }
  toString() {
    return `${this.scheme}://${this.path}`
  }
}

const vscode = new Proxy(
  {
    Uri: FakeUri,
    Disposable: class {
      static from() {
        return { dispose() {} }
      }
      dispose() {}
    },
    EventEmitter: class {
      constructor() {
        this.event = () => ({ dispose() {} })
      }
      fire() {}
    },
    version: '1.999.0-scrakk'
  },
  {
    get(t, prop) {
      if (prop in t) return t[prop]
      if (typeof prop === 'symbol') return undefined
      record(String(prop), 'member')
      return makeProxy(String(prop))
    }
  }
)

const originalLoad = Module._load
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode
  return originalLoad.call(this, request, parent, isMain)
}

// ── Correr ────────────────────────────────────────────────────────────────
let languageclient
try {
  languageclient = require_('vscode-languageclient/node')
  console.log('require("vscode-languageclient/node") OK — version', languageclient.version ?? '?')
  console.log('exports:', Object.keys(languageclient).slice(0, 25).join(', '))
} catch (error) {
  console.log('require FALLÓ:', error.message)
  console.log(touched.size > 0 ? `miembros tocados durante el import: ${[...touched].join(', ')}` : '')
  process.exit(0)
}

const { LanguageClient, TransportKind } = languageclient

const server = fork(join(here, '_probe-lsp-server.mjs'), [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
})

const client = new LanguageClient(
  'probe',
  'Probe',
  { run: { module: join(here, '_probe-lsp-server.mjs'), transport: TransportKind.ipc } },
  { documentSelector: [{ scheme: 'file', language: 'plaintext' }] }
)

console.log('\ninstanciado el client (sin start todavía)')
console.log('tocado en el constructor:', [...touched].join(', '))

try {
  const started = await Promise.race([
    client.start().then(() => 'start OK'),
    new Promise((r) => setTimeout(() => r('start TIMEOUT 8s'), 8000))
  ])
  console.log('\n' + started)
} catch (error) {
  console.log('\nstart FALLÓ:', error.message)
}

console.log('\n── miembros del API tocados (' + touched.size + ') ──')
for (const item of [...touched].sort()) console.log('  ' + item)
if (calls.length > 0) {
  console.log('\n── primeras llamadas ──')
  for (const c of calls.slice(0, 20)) console.log('  ' + c)
}

try {
  server.kill()
} catch {}
try {
  await client.stop()
} catch {}
process.exit(0)

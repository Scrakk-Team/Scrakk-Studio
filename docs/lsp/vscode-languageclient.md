---
title: "Extensiones de VS Code que traen su language server"
group: lsp
order: 100
summary: "En VS Code un language server no es un contribution point: es código. La extensión hace new LanguageClient(...) en su activate y toda la negociación (initialize, capabilities, sync de documentos, d…"
---
# Extensiones de VS Code que traen su language server

En VS Code un language server **no es un contribution point: es código**. La
extensión hace `new LanguageClient(...)` en su `activate` y toda la negociación
(initialize, capabilities, sync de documentos, diagnósticos, requests) la lleva
el paquete `vscode-languageclient`.

Scrakk no reimplementa ese paquete: **corre el real**. Lo que aporta el IDE es
el API `vscode` que la librería consume, exactamente como hace VS Code.

```
extensión (bundle) ──require('vscode-languageclient/node')──┐
                                                            ↓
                                       la LIB REAL (npm)  ←──┐
                                                            │  require('vscode')
                                                            ↓
                              Extension Host ── shim del API (vscodeApi.ts)
```

## Cómo se resuelve el paquete

Dos casos, y la precedencia importa:

| Caso | Qué pasa | Por qué |
|---|---|---|
| **La extensión lo bundlea** (webpack/esbuild) | el `require` sale de su bundle; sólo `vscode` lo intercepta el host | es el ~90% de las extensiones reales y no necesita nada nuestro |
| **Lo declara como dependencia externa** y no lo trae instalado | el host responde con **su** copia (`vscode-languageclient` es dependencia de la app) | sin esto la extensión moría con `Cannot find module` |

La copia de la **extensión gana** siempre (es su versión fijada); la del host es
el respaldo. Se avisa por el log sólo cuando se usa el respaldo, y **sólo se
responde por un `MODULE_NOT_FOUND` del specifier pedido**: si la extensión trae
el paquete y lo que falta es una dependencia suya, el error se propaga en vez de
taparse con nuestra copia.

Implementación: `src/main/extensions/host/languageClientBridge.ts` +
el interceptor de `installVscodeResolver` en `hostProcess.ts`.

## Dos bugs de la capa que esto destapó

La lib real falla RÁPIDO y con mensajes exactos, así que corrió como un test de
compatibilidad del shim. Encontró dos cosas que ninguna extensión de paneles
había tocado:

1. **`vscode.version` reportaba la versión de la APP.** La librería la usa como
   gate:
   `The language client requires VS Code version ^1.82.0 but received version 0.1.0`
   → **toda** extensión con LSP moría al construir su cliente, con un mensaje
   que habla de VS Code y no dice nada del host. Ahora `vscode.version` es la
   versión del API (`@shared/compatibility/apiVersion`), que es lo que el campo
   promete en VS Code; la versión de la app se sigue reportando en `env.version`.
2. **`languages.match` era un stub que devolvía `null`.** La lib decide con eso
   si un documento entra en el `documentSelector` del server
   (`features.js` pregunta `> 0`): con el stub, ningún documento matcheaba y el
   server **nunca recibía un `didOpen`** — el LSP arrancaba y jamás veía un
   archivo. Ahora es real (lenguaje, scheme y glob; un selector vacío matchea,
   como en VS Code).

## Un detalle del protocolo que cuesta una tarde

Con `TransportKind.stdio` la librería **agrega `--stdio` a los args** del
proceso:

```js
// vscode-languageclient/lib/node/main.js
if (transport === TransportKind.stdio) { args.push('--stdio') }
```

Por eso el server se lanza como archivo (`node server.js --stdio`) y no con
`node -e "<código>"`: con `-e` el `--stdio` cae en el parseo de opciones de Node
(`bad option`) y el hijo muere antes del handshake — que se ve, del lado del
cliente, como un `EPIPE` en el primer `initialize` (un síntoma que no señala a
su causa).

## Cómo verificarlo

```bash
npx vitest run tests/language-client-bridge.test.ts
```

El test corre el host REAL (`createHostRuntime`, con el interceptor de módulos
instalado), carga una extensión de fixture del disco que hace
`require('vscode-languageclient/node')`, y esa extensión arranca su client
contra un server LSP real (proceso hijo, framing `Content-Length`) y le manda un
request propio. Si eso pasa, la cadena entera funciona: resolución + shim +
handshake + ida y vuelta.

También hay un arnés de descubrimiento para medir qué superficie del API toca la
librería cuando sube de versión:

```bash
node tools/_probe-languageclient.mjs
```

## Cómo añade alguien su language server (las tres vías)

| Vía | Quién la usa | Estado |
|---|---|---|
| `.scrakk/lsp.json` (proyecto o `~/.scrakk/lsp.json`) | quien no escribe una extensión | ✅ `command`/`args`/`extensions`/`rootMarkers` |
| `contributes.lspServers` (SEF) | un paquete declarativo de Scrakk | ✅ ver [extensions.md](extensions.md) |
| **Un VSIX con `vscode-languageclient`** | una extensión de VS Code tal cual | ✅ el server arranca (esta página) |

## Cómo llegan los proveedores al editor

La librería no responde requests "por su cuenta": los registra como
**proveedores del API `vscode`** (`languages.registerHoverProvider(selector,
provider)` y compañía) y espera que el editor la consulte. Ese era el corte:
el server arrancaba, recibía `didOpen`… y nadie le preguntaba nada.

```
editor (hover) → services/lsp → IPC `lsp:request`
   ├─ LspManager   (server del sistema o de .scrakk/lsp.json)
   └─ providerBridge (main) → cada Extension Host → su proveedor real
                              └─ si la extensión usa LanguageClient, es el client
                                 el que responde (hablando con SU server)
```

- **Host**: `src/main/extensions/host/languageProviders.ts` registra y consulta
  de verdad (con `documentSelector`), y serializa el resultado a la forma del
  LSP (que es la que el editor ya sabe pintar).
- **Main**: `src/main/extensions/providerBridge.ts` traduce el pedido del LSP a
  una consulta y le pregunta a todos los hosts vivos (los que no opinan no
  aparecen). Hay timeout: un proveedor colgado no congela el hover.
- **Consultables hoy**: hover, definición, declaración, implementación, tipo,
  referencias, resaltado de ocurrencias, formateo y formateo de rango. El IDE
  ya PINTA hover, definición y formateo; los demás responden y esperan su UI.
- **Todavía inertes** (registran, avisan por el log y no se consultan):
  completions, signatura, acciones de código, code lens, links, plegado, tokens
  semánticos, inlay hints y las jerarquías. No hay UI para ese resultado.

## Diagnósticos: ahora se VEN

El cliente publica `publishDiagnostics`, el registro del host
(`diagnostics.ts`) los guarda y los EMPUJA al main (`diagnostics/change`), y el
renderer los lista: panel **Problemas** (chip de la barra de estado incluido,
con los conteos por severidad). Comparten store con los del LSP
(`services/lsp/diagnosticsStore.ts`), con una entrada por fuente, así que el
linter de una extensión y `tsc` no se pisan entre sí.

Lo que falta de este camino: el SUBRAYADO en el editor (el canvas de Innerta
necesita aceptar rangos de decoración). El panel lo dice en su pie en vez de dar
a entender que el editor ya lo marca.

## Límites (dichos, no escondidos)

- **El server es hijo del HOST, no del manager LSP del IDE.** El ciclo de vida
  (estado, reinicio, auto-instalación, botón de la UI) vive en `src/main/lsp`, y
  un client que arranca la extensión no pasa por ahí. Unificar los dos caminos
  es el siguiente paso natural.
- **`TransportKind.ipc` / `pipe` / `socket`**: los soporta la librería por su
  cuenta (spawnea ella), así que funcionan igual que stdio; lo que NO está
  medido todavía es un server que negocie `workspace/configuration` con
  settings reales del IDE.
- **Extensiones que son SOLO server** (rust-analyzer, pyright, clangd de VS
  Code) todavía necesitan que su binario exista: el IDE no instala sus
  dependencias por ellas (eso sí lo hace la vía `lspServers` con `install`).

## MIGRACIÓN A OWEAR (leer antes de tocar)

El puente no conoce Electron, ni stdio, ni el sistema de módulos más allá del
interceptor. Cuando Owear reemplace el runtime: `languageClientBridge.ts` se
conserva o se tira entero, y lo único que hay que reescribir es
`installVscodeResolver` (el mismo punto que ya estaba marcado para eso).

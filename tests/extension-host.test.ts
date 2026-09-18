/**
 * Extension Host — tests de la capa real (sin Electron).
 *
 * Se enlazan DOS `RpcPeer` en memoria (uno por lado, con sus signos de id) y
 * se corre el `createHostRuntime` de verdad. Así se prueba el protocolo, el
 * shim del API `vscode`, el ciclo de vida, las vistas webview y el puente de
 * comandos/notificaciones: exactamente lo que corre en producción, salvo el
 * transporte.
 */

import { describe, expect, it } from 'vitest'
import type { HostEvent, HostMessage, NotifyResult } from '../src/shared/extensionHost/protocol'
import { HOST_PROTOCOL_VERSION } from '../src/shared/extensionHost/protocol'
import { RpcPeer } from '../src/main/extensions/host/rpc'
import { createHostRuntime } from '../src/main/extensions/host/hostProcess'
import { createMemento, flattenConfigurationDefaults } from '../src/main/extensions/host/vscodeApi'
import { Disposable, EventEmitter, Uri, unsupported } from '../src/main/extensions/host/vscodeShim'

// El shim imita un API de terceros: tipar cada miembro acá ataría el test a la
// forma del shim en vez de a su comportamiento.
/* eslint-disable @typescript-eslint/no-explicit-any */

const INIT = {
  extensionId: 'demo.extension',
  extensionPath: '/tmp/demo-extension',
  entry: 'runtime/extension.js',
  workspaceRoots: ['/tmp/workspace'],
  permissions: ['fs.read'],
  mode: 'strict' as const
}

/** Dos peers que se entregan mensajes de forma síncrona (sin proceso). */
function linkedPeers(): { main: RpcPeer; host: RpcPeer } {
  const holders: { main?: RpcPeer; host?: RpcPeer } = {}
  const main = new RpcPeer(
    { send: (message: HostMessage) => holders.host?.receive(message) },
    { idSign: 1, label: 'main' }
  )
  const host = new RpcPeer(
    { send: (message: HostMessage) => holders.main?.receive(message) },
    { idSign: -1, label: 'host' }
  )
  holders.main = main
  holders.host = host
  return { main, host }
}

interface Harness {
  main: RpcPeer
  events: Array<{ event: HostEvent; payload: unknown }>
  receivedByExtension: unknown[]
  /** El `vscode` que recibió la extensión (disponible tras `init`). */
  api: () => any
  /** Payload del saludo `ready` del host. */
  readyPayload: () => unknown
  ready: Promise<void>
}

/**
 * Arma el host con una extensión de fixture. Los listeners se enganchan
 * ANTES de `start()` porque el host emite `ready` en el mismo tick.
 */
function harness(entry?: { activate?: (api: any) => void }): Harness {
  const { main, host } = linkedPeers()
  const events: Array<{ event: HostEvent; payload: unknown }> = []
  const receivedByExtension: unknown[] = []
  let captured: any = null

  const runtime = createHostRuntime({
    peer: host,
    loadExtension: (_entryPath, vscode) => {
      captured = vscode
      const api = vscode as any
      return {
        activate() {
          if (entry?.activate) {
            entry.activate(api)
            return
          }
          api.window.registerWebviewViewProvider('demo.chat', {
            resolveWebviewView(view: any) {
              view.title = 'Chat de prueba'
              view.webview.onDidReceiveMessage((message: unknown) =>
                receivedByExtension.push(message)
              )
              view.webview.html = '<h1>hola</h1>'
            }
          })
          api.commands.registerCommand('demo.echo', (text: unknown) => `echo:${String(text)}`)
          api.commands.registerCommand('demo.boom', () => {
            throw new Error('boom a propósito')
          })
        }
      }
    }
  })

  let greeted: unknown
  const ready = new Promise<void>((resolve) =>
    main.on('ready', (payload) => {
      greeted = payload
      resolve()
    })
  )
  for (const event of [
    'log',
    'command/registered',
    'view/html',
    'view/title',
    'view/post',
    'view/tree',
    'view/tree-change',
    'status/item',
    'diagnostics/change',
    'decorations/set',
    'panel/open',
    'panel/update',
    'panel/close',
    'fatal'
  ] as HostEvent[]) {
    main.on(event, (payload) => events.push({ event, payload }))
  }
  runtime.start()

  return {
    main,
    events,
    receivedByExtension,
    api: () => captured,
    readyPayload: () => greeted,
    ready
  }
}

/** Host ya inicializado y con la extensión activada. */
async function booted(entry?: { activate?: (api: any) => void }): Promise<Harness> {
  const h = harness(entry)
  await h.ready
  await h.main.request('init', { ...INIT })
  await h.main.request('activate')
  return h
}

function payloadsOf(events: Harness['events'], event: HostEvent): unknown[] {
  return events.filter((e) => e.event === event).map((e) => e.payload)
}

// ── Primitivas del shim ───────────────────────────────────────────────────

describe('shim: primitivas', () => {
  it('Uri.file / parse / joinPath se comportan como el API real', () => {
    expect(Uri.file('/a/b').toString()).toBe('file:///a/b')
    expect(Uri.parse('file:///x/y').fsPath).toBe('/x/y')
    expect(Uri.joinPath(Uri.file('/root/'), 'a', '/b/').toString()).toBe('file:///root/a/b')
  })

  it('EventEmitter despacha a todos y un listener roto no corta al resto', () => {
    const emitter = new EventEmitter<number>()
    const seen: number[] = []
    emitter.event(() => {
      throw new Error('listener roto')
    })
    emitter.event((value) => seen.push(value))
    emitter.fire(7)
    expect(seen).toEqual([7])
  })

  it('Disposable.dispose es idempotente', () => {
    let calls = 0
    const d = new Disposable(() => {
      calls += 1
    })
    d.dispose()
    d.dispose()
    expect(calls).toBe(1)
  })

  it('memento guarda, devuelve default y borra con undefined', async () => {
    const memento = createMemento({ a: 1 })
    expect(memento.get('a')).toBe(1)
    expect(memento.get('faltante', 'x')).toBe('x')
    await memento.update('b', 2)
    await memento.update('a', undefined)
    expect(memento.keys()).toEqual(['b'])
  })

  it('aplana contributes.configuration a defaults', () => {
    const defaults = flattenConfigurationDefaults({
      properties: {
        'demo.mode': { default: 'fast' },
        'demo.sinDefault': { type: 'string' }
      }
    })
    expect(defaults).toEqual({ 'demo.mode': 'fast' })
  })

  it('unsupported() nombra el API que falta', () => {
    expect(unsupported('window.createWebviewPanel').message).toContain('createWebviewPanel')
  })
})

// ── Ciclo de vida ─────────────────────────────────────────────────────────

describe('host: ciclo de vida', () => {
  it('saluda con la versión del protocolo', async () => {
    const h = harness()
    await h.ready
    expect(h.readyPayload()).toMatchObject({ protocolVersion: HOST_PROTOCOL_VERSION })
  })

  it('activate sin init falla con un mensaje claro', async () => {
    const { main, host } = linkedPeers()
    createHostRuntime({ peer: host, loadExtension: () => ({}) }).start()
    await expect(main.request('activate')).rejects.toThrow(/sin init/)
  })

  it('init devuelve la versión y activate reporta los comandos', async () => {
    const h = harness()
    await h.ready
    const result = await h.main.request<{ protocolVersion: number }>('init', { ...INIT })
    expect(result.protocolVersion).toBe(HOST_PROTOCOL_VERSION)

    const activated = await h.main.request<{ commands: string[] }>('activate')
    expect(activated.commands.sort()).toEqual(['demo.boom', 'demo.echo'])

    const registered = payloadsOf(h.events, 'command/registered') as Array<{
      id: string
      registered: boolean
    }>
    expect(registered.map((r) => r.id).sort()).toEqual(['demo.boom', 'demo.echo'])
  })
})

// ── Vistas webview (el objetivo: paneles de la activity bar) ──────────────

describe('host: vistas webview', () => {
  it('resolveView hace que la extensión publique el HTML de su panel', async () => {
    const h = await booted()
    const resolved = await h.main.request('view/resolve', { viewId: 'demo.chat', title: 'Chat' })
    // El TIPO lo responde el host: el renderer no adivina por el manifest.
    expect(resolved).toMatchObject({ ok: true, kind: 'webview' })

    const html = payloadsOf(h.events, 'view/html') as Array<{ viewId: string; html: string }>
    expect(html).toHaveLength(1)
    expect(html[0]).toMatchObject({ viewId: 'demo.chat', html: '<h1>hola</h1>' })

    const titles = payloadsOf(h.events, 'view/title') as Array<{ title: string }>
    expect(titles.at(-1)?.title).toBe('Chat de prueba')
  })

  it('el mensaje del iframe llega al onDidReceiveMessage de la extensión', async () => {
    const h = await booted()
    await h.main.request('view/resolve', { viewId: 'demo.chat', title: 'Chat' })
    await h.main.request('view/receive', {
      viewId: 'demo.chat',
      message: { type: 'userSaid', text: 'hola' }
    })
    expect(h.receivedByExtension).toEqual([{ type: 'userSaid', text: 'hola' }])
  })

  it('webview.postMessage de la extensión sale como evento view/post', async () => {
    const h = await booted({
      activate: (api) => {
        api.window.registerWebviewViewProvider('demo.chat', {
          resolveWebviewView(view: any) {
            void view.webview.postMessage({ type: 'reply', text: 'buenas' })
          }
        })
      }
    })
    await h.main.request('view/resolve', { viewId: 'demo.chat', title: 'Chat' })
    const posts = payloadsOf(h.events, 'view/post') as Array<{ message: unknown }>
    expect(posts).toEqual([{ viewId: 'demo.chat', message: { type: 'reply', text: 'buenas' } }])
  })

  it('resolveView sin provider falla nombrando la vista (no deja el panel mudo)', async () => {
    const h = await booted()
    await expect(
      h.main.request('view/resolve', { viewId: 'no.existe', title: 'X' })
    ).rejects.toThrow(/no registró ninguna vista para "no.existe"/)
  })

  it('disposeView corta el flujo de mensajes de esa vista', async () => {
    const h = await booted()
    await h.main.request('view/resolve', { viewId: 'demo.chat', title: 'Chat' })
    await h.main.request('view/dispose', { viewId: 'demo.chat' })
    await h.main.request('view/receive', { viewId: 'demo.chat', message: { late: true } })
    expect(h.receivedByExtension).toEqual([])
  })
})

// ── Comandos ──────────────────────────────────────────────────────────────

// ── Vistas de ÁRBOL (el otro sabor de panel de la activity bar) ───────────

describe('host: vistas de árbol', () => {
  /** Extensión con un árbol de dos niveles y comandos en los nodos. */
  const treeExtension = {
    activate: (api: any) => {
      api.window.registerTreeDataProvider('demo.tree', {
        getChildren(element?: any) {
          if (!element) return [{ id: 'src', label: 'src', collapsibleState: 1 }]
          if (element.id === 'src') {
            return [
              new api.TreeItem('index.ts', api.TreeItemCollapsibleState.None),
              { id: 'lib', label: 'lib' }
            ]
          }
          return []
        },
        getTreeItem(element: any) {
          if (element instanceof api.TreeItem) {
            element.command = { command: 'demo.openFile', arguments: [element.label] }
            element.description = 'archivo'
            return element
          }
          const item = new api.TreeItem(element.label, element.collapsibleState ?? 0)
          item.id = element.id
          item.command = { command: 'demo.openFile', arguments: [element.id] }
          return item
        }
      })
      api.commands.registerCommand('demo.openFile', (name: unknown) => `abrir:${String(name)}`)
    }
  }

  it('resolveView de un árbol responde kind=tree y publica la raíz', async () => {
    const h = await booted(treeExtension)
    const resolved = await h.main.request('view/resolve', { viewId: 'demo.tree', title: 'Árbol' })
    expect(resolved).toMatchObject({ ok: true, kind: 'tree' })

    const snapshots = payloadsOf(h.events, 'view/tree') as Array<{
      viewId: string
      nodes: Array<{ id: string; label: string; collapsible: number }>
    }>
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].viewId).toBe('demo.tree')
    expect(snapshots[0].nodes).toMatchObject([{ label: 'src', collapsible: 1 }])
  })

  it('tree/children baja un nivel y respeta el id opaco', async () => {
    const h = await booted(treeExtension)
    const root = (await h.main.request('tree/children', {
      viewId: 'demo.tree',
      elementId: null
    })) as { nodes: Array<{ id: string }> }
    expect(root.nodes).toHaveLength(1)

    const kids = (await h.main.request('tree/children', {
      viewId: 'demo.tree',
      elementId: root.nodes[0].id
    })) as { nodes: Array<{ id: string; label: string; description?: string; command?: string }> }
    expect(kids.nodes.map((n) => n.label)).toEqual(['index.ts', 'lib'])
    expect(kids.nodes[0].description).toBe('archivo')
    // El comando viaja como METADATO: los argumentos se quedan en el host.
    expect(kids.nodes[0].command).toBe('demo.openFile')
  })

  it('tree/select corre el comando del item con sus argumentos REALES', async () => {
    const h = await booted(treeExtension)
    const root = (await h.main.request('tree/children', {
      viewId: 'demo.tree',
      elementId: null
    })) as { nodes: Array<{ id: string }> }
    const kids = (await h.main.request('tree/children', {
      viewId: 'demo.tree',
      elementId: root.nodes[0].id
    })) as { nodes: Array<{ id: string }> }

    const result = (await h.main.request('tree/select', {
      viewId: 'demo.tree',
      elementId: kids.nodes[0].id
    })) as { ran: boolean; command?: string }
    expect(result).toMatchObject({ ran: true, command: 'demo.openFile' })
  })

  it('tree/select de un nodo sin comando no corre nada', async () => {
    const h = await booted()
    const api = h.api()
    api.window.registerTreeDataProvider('demo.plain', {
      getChildren: () => [{ id: 'a', label: 'a' }]
    })
    const root = (await h.main.request('tree/children', {
      viewId: 'demo.plain',
      elementId: null
    })) as { nodes: Array<{ id: string }> }
    const result = (await h.main.request('tree/select', {
      viewId: 'demo.plain',
      elementId: root.nodes[0].id
    })) as { ran: boolean }
    expect(result.ran).toBe(false)
  })

  it('onDidChangeTreeData se traduce en view/tree-change', async () => {
    const h = await booted({
      activate: (api) => {
        const emitter = new api.EventEmitter()
        api.window.registerTreeDataProvider('demo.refresh', {
          getChildren: () => [],
          onDidChangeTreeData: emitter.event
        })
        // La extensión refresca la vista entera (sin elemento).
        void api.commands.registerCommand('demo.refresh', () => emitter.fire(undefined))
      }
    })
    await h.main.request('view/resolve', { viewId: 'demo.refresh', title: 'X' })
    await h.main.request('command/execute', { id: 'demo.refresh' })

    const changes = payloadsOf(h.events, 'view/tree-change') as Array<{
      viewId: string
      elementId?: string
    }>
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ viewId: 'demo.refresh' })
    // Sin elementId: hay que recargar la raíz entera.
    expect(changes[0].elementId).toBeUndefined()
  })

  it('un árbol desconocido falla nombrando el viewId', async () => {
    const h = await booted()
    await expect(
      h.main.request('tree/children', { viewId: 'nope', elementId: null })
    ).rejects.toThrow(/no registró un árbol/)
  })
})

// ── Comandos ──────────────────────────────────────────────────────────────

describe('host: comandos', () => {
  it('command/execute corre el comando local y devuelve el valor', async () => {
    const h = await booted()
    await expect(
      h.main.request('command/execute', { id: 'demo.echo', args: ['hola'] })
    ).resolves.toBe('echo:hola')
  })

  it('el error de un comando se propaga con su mensaje', async () => {
    const h = await booted()
    await expect(h.main.request('command/execute', { id: 'demo.boom' })).rejects.toThrow(
      'boom a propósito'
    )
  })

  /**
   * Un id que NO es de la extensión no puede morir en "no registró el
   * comando": la UI también pide built-ins del IDE por este camino (el botón
   * de un `viewsWelcome`, por ejemplo). El host delega y devuelve lo que el
   * IDE responda.
   */
  it('un comando que no es de la extensión se le pide al IDE', async () => {
    const h = await booted()
    h.main.handle('command/execute', () => 'desde el IDE')
    await expect(h.main.request('command/execute', { id: 'workbench.action.openSettings' })).resolves.toBe(
      'desde el IDE'
    )
  })

  it('si el IDE tampoco lo tiene, el error nombra el id', async () => {
    const h = await booted()
    h.main.handle('command/execute', (raw) => {
      const { id } = raw as { id: string }
      throw new Error(`el IDE no tiene el comando "${id}"`)
    })
    await expect(h.main.request('command/execute', { id: 'demo.nada' })).rejects.toThrow(
      /demo\.nada/
    )
  })

  it('un método desconocido responde error en vez de colgarse', async () => {
    const h = await booted()
    // @ts-expect-error: se prueba justamente un método fuera del protocolo.
    await expect(h.main.request('no/existe')).rejects.toThrow(/desconocido/)
  })

  it('executeCommand de un id local no sale al main', async () => {
    const h = await booted()
    let mainCalls = 0
    h.main.handle('command/execute', () => {
      mainCalls += 1
      return 'desde el IDE'
    })
    const api = h.api()
    await expect(api.commands.executeCommand('demo.echo', 'x')).resolves.toBe('echo:x')
    await expect(api.commands.executeCommand('otro.comando')).resolves.toBe('desde el IDE')
    expect(mainCalls).toBe(1)
  })
})

// ── Puente host → main (ids negativos) ────────────────────────────────────

describe('host: pedidos hacia el main', () => {
  it('showInformationMessage con botones devuelve el item elegido', async () => {
    let askedActions: string[] | undefined
    const h = harness()
    h.main.handle('notify', (raw) => {
      askedActions = (raw as { actions?: string[] }).actions
      return { actionIndex: 1 } satisfies NotifyResult
    })
    await h.ready
    await h.main.request('init', { ...INIT })
    await h.main.request('activate')

    const answer = await h.api().window.showInformationMessage('¿Seguimos?', 'Sí', 'No')
    expect(askedActions).toEqual(['Sí', 'No'])
    expect(answer).toBe('No')
  })

  it('showInformationMessage sin botones resuelve undefined', async () => {
    const h = harness()
    h.main.handle('notify', () => ({}) satisfies NotifyResult)
    await h.ready
    await h.main.request('init', { ...INIT })
    await h.main.request('activate')
    await expect(h.api().window.showInformationMessage('solo texto')).resolves.toBeUndefined()
  })

  /**
   * Regresión del crash del renderer: `showInformationMessage(msg, {modal,
   * detail}, ...items)` (así lo llama Cline) mandaba el objeto de opciones como
   * si fuera la etiqueta de un botón, la UI intentaba renderizarlo y React
   * tumbaba la app ("Objects are not valid as a React child … {modal, detail}").
   * El `detail` viaja aparte y NUNCA como botón.
   */
  it('MessageOptions ({modal, detail}) no se mezcla con los botones', async () => {
    let payload: { actions?: unknown[]; detail?: string; modal?: boolean } | undefined
    const h = harness()
    h.main.handle('notify', (raw) => {
      payload = raw as typeof payload
      return { actionIndex: 0 } satisfies NotifyResult
    })
    await h.ready
    await h.main.request('init', { ...INIT })
    await h.main.request('activate')

    const answer = await h.api().window.showInformationMessage(
      '¿Seguro?',
      { modal: true, detail: 'detalle largo' },
      'Sí',
      'No'
    )

    expect(payload?.actions).toEqual(['Sí', 'No'])
    expect(payload?.detail).toBe('detalle largo')
    expect(payload?.modal).toBe(true)
    expect(answer).toBe('Sí')
  })

  it('MessageItem devuelve el objeto elegido y el botón de cierre es undefined', async () => {
    let actionIndex = 0
    const h = harness()
    h.main.handle('notify', () => ({ actionIndex }) satisfies NotifyResult)
    await h.ready
    await h.main.request('init', { ...INIT })
    await h.main.request('activate')

    const api = h.api()
    const menu = new api.MessageItem('Abrir ajustes', false)
    const cancel = new api.MessageItem('Ahora no', true)
    expect(await api.window.showInformationMessage('¿Vamos?', menu, cancel)).toBe(menu)

    // Elegir el botón de cierre equivale a "no eligió nada".
    actionIndex = 1
    expect(await api.window.showWarningMessage('¿Vamos?', menu, cancel)).toBeUndefined()
  })

  /**
   * `registerTextDocumentContentProvider`: Cline lo registra al activar y sin
   * esto su `activate()` moría con "is not a function". El documento es REAL
   * (texto, lenguaje y uri originales), no un objeto de mentira.
   */
  it('registerTextDocumentContentProvider sirve documentos virtuales', async () => {
    const h = await booted({
      activate: (api) => {
        api.workspace.registerTextDocumentContentProvider('demo-diff', {
          provideTextDocumentContent: (uri: any) => `contenido de ${uri.toString()}`
        })
      }
    })

    const uri = Uri.parse('demo-diff://revision/uno?old=1')
    const document = await h.api().workspace.openTextDocument(uri)
    expect(document.getText()).toBe('contenido de demo-diff://revision/uno?old=1')
    // La URI se conserva tal cual (las extensiones la comparan por `toString`).
    expect(document.uri.toString()).toBe('demo-diff://revision/uno?old=1')
    expect(h.api().workspace.textDocuments).toContain(document)
  })

  it('openTextDocument sin provider para el esquema falla con causa clara', async () => {
    const h = await booted()
    await expect(h.api().workspace.openTextDocument(Uri.parse('nadie-sirve-esto://x'))).rejects.toThrow(
      'no hay ningún TextDocumentContentProvider para el esquema "nadie-sirve-esto"'
    )
  })

  it('Uri conserva query y fragment (los usa el contenido virtual)', () => {
    expect(Uri.parse('demo-diff://a/b?old=1#seccion').toString()).toBe('demo-diff://a/b?old=1#seccion')
    expect(Uri.file('/tmp/x.txt').toString()).toBe('file:///tmp/x.txt')
    expect(Uri.parse('demo://a/b').with({ path: '/c' }).toString()).toBe('demo://a/c')
  })

  /**
   * `activate` corre UNA vez por host, como en VS Code: dos pedidos (el botón de
   * la activity bar y el panel) comparten la corrida. Reintentarla ejecuta el
   * `activate` de la extensión sobre una inicialización a medias y tapa el error
   * original (a Cline le devolvía "Host provider has already been initialized.").
   */
  it('activate corre una sola vez aunque se lo pidan dos veces', async () => {
    let runs = 0
    const h = harness({ activate: () => void (runs += 1) })
    await h.ready
    await h.main.request('init', { ...INIT })
    await h.main.request('activate')
    await h.main.request('activate')
    expect(runs).toBe(1)
  })

  it('createOutputChannel con { log: true } expone trace/debug/info/warn/error', async () => {
    const h = await booted({
      activate: (api) => {
        api.__channel = api.window.createOutputChannel('Cline', { log: true })
      }
    })
    const channel = (h.api() as { __channel: Record<string, (...a: unknown[]) => void> }).__channel
    for (const method of ['trace', 'debug', 'info', 'warn', 'error']) {
      expect(typeof channel[method]).toBe('function')
    }
    expect(typeof channel.logLevel).toBe('number')
  })

  it('fs/read denegado se propaga como excepción al `workspace.fs`', async () => {
    const h = harness()
    h.main.handle('fs/read', () => ({ success: false, error: 'ruta sensible protegida' }))
    await h.ready
    await h.main.request('init', { ...INIT })
    await h.main.request('activate')

    await expect(h.api().workspace.fs.readFile(Uri.file('/home/u/.ssh/id_rsa'))).rejects.toThrow(
      'ruta sensible protegida'
    )
  })

  it('fs/read permitido entrega el contenido', async () => {
    const h = harness()
    h.main.handle('fs/read', () => ({ success: true, value: 'contenido del archivo' }))
    await h.ready
    await h.main.request('init', { ...INIT })
    await h.main.request('activate')

    const bytes: Uint8Array = await h.api().workspace.fs.readFile(
      Uri.file('/tmp/workspace/a.txt')
    )
    expect(new TextDecoder().decode(bytes)).toBe('contenido del archivo')
  })
})

// ── Honestidad del shim ───────────────────────────────────────────────────

describe('shim: lo no soportado falla claro', () => {
  it('lo que falta de verdad (quick pick, input box) tira error explícito', async () => {
    const h = await booted()
    expect(() => h.api().window.showQuickPick([])).toThrow(/showQuickPick/)
    expect(() => h.api().window.showInputBox()).toThrow(/showInputBox/)
  })

  it('lo inerte existe y AVISA en el log (no rompe activate ni se calla)', async () => {
    const h = await booted({
      activate: (api) => {
        // Lo que hace una extensión real al activarse (medido con Comment
        // Anchors): crear estos objetos y suscribirse a sus eventos.
        const watcher = api.window.createFileSystemWatcher('**/*.ts')
        const decorations = api.window.createTextEditorDecorationType()
        const diagnostics = api.languages.createDiagnosticCollection('demo')
        const link = api.languages.registerDocumentLinkProvider('ts', {})
        api.workspace.onDidChangeTextDocument(() => undefined)
        watcher.onDidChange(() => undefined)
        link.dispose()
        decorations.dispose()
        diagnostics.dispose()
      }
    })

    const logs = payloadsOf(h.events, 'log') as Array<{ level: string; message: string }>
    const warnings = logs.filter((l) => l.level === 'warn')
    expect(warnings.some((l) => l.message.includes('watchers'))).toBe(true)
    // Las decoraciones son REALES de punta a punta (el tipo se crea, los
    // rangos se guardan y el IDE los subraya): crear un tipo NO avisa nada.
    // Antes avisaba "las decoraciones todavía no se pintan".
    expect(warnings.some((l) => l.message.includes('decoraciones'))).toBe(false)
    // Los proveedores que el IDE consulta ya NO avisan; los que no tienen UI
    // sí, y por NOMBRE (registerDocumentLinkProvider en este caso).
    expect(warnings.some((l) => l.message.includes('registerDocumentLinkProvider'))).toBe(true)
    // Los diagnósticos son REALES de punta a punta (se guardan, se consultan y
    // el IDE los pinta): crear una colección NO avisa nada.
    expect(warnings.some((l) => l.message.includes('diagnósticos'))).toBe(false)
    // Una sola vez por API, aunque se cree más de un objeto.
    expect(warnings.filter((l) => l.message.includes('watchers'))).toHaveLength(1)
  })

  it('los diagnósticos de la extensión VIAJAN a la UI (evento diagnostics/change)', async () => {
    const h = await booted({
      activate: (api) => {
        const collection = api.window.createDiagnosticCollection('linter')
        const uri = Uri.file('/tmp/workspace/src/a.ts')
        // Severidad 0 = Error en VS Code (1 = Error en el LSP): la conversión
        // tiene que llegar hecha a la UI. Un error pintado como hint es un
        // error invisible.
        collection.set(uri, [
          new api.Diagnostic(new api.Range(2, 4, 2, 9), 'algo pasó', 0),
          new api.Diagnostic(new api.Range(7, 0, 7, 3), 'ojo con esto', 1)
        ])
        api.commands.registerCommand('demo.limpiar', () => {
          collection.set(uri, [])
          return true
        })
      }
    })

    const pushes = payloadsOf(h.events, 'diagnostics/change') as Array<{
      entries: Array<{ path: string; diagnostics: any[] }>
    }>
    expect(pushes).toHaveLength(1)
    expect(pushes[0].entries).toHaveLength(1)
    expect(pushes[0].entries[0].path).toBe('/tmp/workspace/src/a.ts')
    expect(pushes[0].entries[0].diagnostics).toEqual([
      {
        range: { start: { line: 2, character: 4 }, end: { line: 2, character: 9 } },
        severity: 1,
        message: 'algo pasó'
      },
      {
        range: { start: { line: 7, character: 0 }, end: { line: 7, character: 3 } },
        severity: 2,
        message: 'ojo con esto'
      }
    ])

    // Limpiar la colección también se avisa (con la lista vacía): es lo que
    // borra el problema de la UI cuando deja de existir.
    await h.main.request('command/execute', { id: 'demo.limpiar', args: [] })
    const after = payloadsOf(h.events, 'diagnostics/change') as Array<{
      entries: Array<{ path: string; diagnostics: unknown[] }>
    }>
    expect(after).toHaveLength(2)
    expect(after[1].entries).toEqual([{ path: '/tmp/workspace/src/a.ts', diagnostics: [] }])
  })

  it('los diagnósticos se guardan y se pueden consultar', async () => {
    const h = await booted({
      activate: (api) => {
        const collection = api.window.createDiagnosticCollection('demo')
        const uri = Uri.file('/tmp/demo.ts')
        collection.set(uri, [new api.Diagnostic(new api.Range(1, 0, 1, 5), 'algo pasó', 0)])
        api.commands.registerCommand('demo.diagnosticos', () => ({
          hay: collection.has(uri),
          propios: collection.get(uri)?.length ?? 0,
          leidos: api.languages.getDiagnostics(uri).length
        }))
      }
    })

    const result = (await h.main.request('command/execute', {
      id: 'demo.diagnosticos',
      args: []
    })) as { hay: boolean; propios: number; leidos: number }
    expect(result).toEqual({ hay: true, propios: 1, leidos: 1 })
  })

  it('workspace.textDocuments arranca vacío y el evento existe', async () => {
    const h = await booted()
    const api = h.api()
    expect(api.workspace.textDocuments).toEqual([])
    const disposable = api.workspace.onDidChangeTextDocument(() => undefined)
    expect(disposable.dispose).toBeTypeOf('function')
    disposable.dispose()
  })

  it('createTreeView registra el provider y devuelve un handle usable', async () => {
    const h = await booted({
      activate: (api) => {
        const view = api.window.createTreeView('demo.view', {
          treeDataProvider: { getChildren: () => [{ id: 'r', label: 'raíz' }] }
        })
        view.title = 'Mi vista'
        api.commands.registerCommand('demo.leerTitulo', () => view.title)
      }
    })
    expect(h.api().window.createTreeView).toBeTypeOf('function')
    const resolved = await h.main.request('view/resolve', { viewId: 'demo.view', title: 'V' })
    expect(resolved).toMatchObject({ kind: 'tree' })
    await expect(h.main.request('command/execute', { id: 'demo.leerTitulo' })).resolves.toBe(
      'Mi vista'
    )
  })

  it('workspaceFolders sale de los roots que dio el main', async () => {
    const h = await booted()
    const api = h.api()
    expect(api.workspace.rootPath).toBe('/tmp/workspace')
    expect(api.workspace.workspaceFolders[0].name).toBe('workspace')
    expect(api.workspace.asRelativePath('/tmp/workspace/src/a.ts')).toBe('src/a.ts')
    expect(api.env.appName).toBe('Scrakk Studio')
  })

  it('getConfiguration lee los defaults que mandó el main', async () => {
    const { main, host } = linkedPeers()
    let captured: any
    createHostRuntime({
      peer: host,
      loadExtension: (_p, vscode) => {
        captured = vscode
        return { activate: async () => undefined }
      }
    }).start()
    await main.request('init', { ...INIT, configurationDefaults: { 'demo.mode': 'fast' } })
    await main.request('activate')
    expect(captured.workspace.getConfiguration('demo').get('demo.mode', 'slow')).toBe('fast')
    expect(captured.workspace.getConfiguration().get('demo.otro', 'slow')).toBe('slow')
  })
})

// ── Barra de estado (real) ────────────────────────────────────────────────

describe('window.createStatusBarItem: real', () => {
  /** Items empujados por el host (payload de `status/item`). */
  function statusItems(h: Harness): any[] {
    return payloadsOf(h.events, 'status/item') as any[]
  }

  it('show empuja el modelo con alineación, prioridad y codicon separado', async () => {
    const h = await booted({
      activate: (api) => {
        const item = api.window.createStatusBarItem(2, 42)
        item.text = '$(bug) 3 problemas'
        item.tooltip = 'Tooltip **markdown**'
        item.command = 'demo.fix'
        item.show()
      }
    })

    const last = statusItems(h).at(-1)
    expect(last).toMatchObject({
      extensionId: 'demo.extension',
      alignment: 'right',
      priority: 42,
      text: '3 problemas',
      icon: 'bug',
      command: 'demo.fix',
      visible: true
    })
    expect(last.tooltip).toContain('Tooltip')
  })

  it('hide y dispose avisan a la UI (dispose manda el borrado)', async () => {
    let item: any
    const h = await booted({
      activate: (api) => {
        item = api.window.createStatusBarItem(1, 1)
        item.text = 'x'
        item.show()
      }
    })
    item.hide()
    item.dispose()
    // El flush del texto tiene debounce (40 ms): se espera un tick.
    await new Promise((resolve) => setTimeout(resolve, 80))
    const payloads = statusItems(h)
    expect(payloads.some((p) => p.visible === false)).toBe(true)
    expect(payloads.some((p) => p.removed === true && p.id === item.id)).toBe(true)
  })

  it('setStatusBarMessage crea un item temporal que se puede cerrar', async () => {
    let disposable: any
    const h = await booted({
      activate: (api) => {
        disposable = api.window.setStatusBarMessage('Indexando…')
      }
    })
    expect(statusItems(h).some((p) => p.text === 'Indexando…' && p.visible)).toBe(true)
    disposable.dispose()
    expect(statusItems(h).some((p) => p.removed === true)).toBe(true)
  })
})

// ── Paneles de webview del editor (reales) ────────────────────────────────

describe('window.createWebviewPanel: real', () => {
  function panelsOf(h: Harness, event: HostEvent): any[] {
    return payloadsOf(h.events, event) as any[]
  }

  it('crea el panel, publica su HTML y avisa el título', async () => {
    const h = await booted({
      activate: (api) => {
        api.commands.registerCommand('demo.abrir', () => {
          const panel = api.window.createWebviewPanel('demo.panel', 'Mi panel', 1, {
            enableScripts: true
          })
          panel.webview.html = '<h1>hola</h1>'
          panel.title = 'Otro título'
          return panel.viewType
        })
      }
    })

    await expect(h.main.request('command/execute', { id: 'demo.abrir' })).resolves.toBe('demo.panel')

    const opened = panelsOf(h, 'panel/open')
    expect(opened[0]).toMatchObject({ title: 'Mi panel', visible: true, viewColumn: 1 })
    expect(opened[0].id).toMatch(/^panel:demo\.extension#\d+$/)
    // El HTML viaja al main, que lo sirve por `scrakk-ext://…/__panel__/…`.
    const update = panelsOf(h, 'panel/update').at(-1)
    expect(update.html).toBe('<h1>hola</h1>')
    expect(update.hasHtml).toBe(true)
    // El título nuevo vuelve como upsert del mismo id.
    expect(opened.at(-1).title).toBe('Otro título')
  })

  it('los mensajes del iframe llegan al handler de la extensión', async () => {
    const recibidos: unknown[] = []
    const h = await booted({
      activate: (api) => {
        api.commands.registerCommand('demo.panel2', () => {
          const panel = api.window.createWebviewPanel('demo.panel2', 'P2', 1)
          panel.webview.onDidReceiveMessage((m: unknown) => recibidos.push(m))
        })
      }
    })
    await h.main.request('command/execute', { id: 'demo.panel2' })
    const panelId = (panelsOf(h, 'panel/open')[0] as { id: string }).id
    await h.main.request('view/receive', { viewId: panelId, message: { tipo: 'hola' } })
    expect(recibidos).toEqual([{ tipo: 'hola' }])
  })

  it('dispose cierra el panel, avisa y dispara onDidDispose', async () => {
    let disposed = 0
    const h = await booted({
      activate: (api) => {
        api.commands.registerCommand('demo.panel3', () => {
          const panel = api.window.createWebviewPanel('demo.panel3', 'P3', 1)
          panel.onDidDispose(() => {
            disposed += 1
          })
          api.commands.registerCommand('demo.cerrarPanel', () => panel.dispose())
        })
      }
    })
    await h.main.request('command/execute', { id: 'demo.panel3' })
    await h.main.request('command/execute', { id: 'demo.cerrarPanel' })
    expect(disposed).toBe(1)
    expect(panelsOf(h, 'panel/close')).toHaveLength(1)
  })

  it('panel/dispose (el usuario cerró la tab) dispone el panel de la extensión', async () => {
    let disposed = 0
    const h = await booted({
      activate: (api) => {
        api.commands.registerCommand('demo.panel4', () => {
          const panel = api.window.createWebviewPanel('demo.panel4', 'P4', 1)
          panel.onDidDispose(() => {
            disposed += 1
          })
        })
      }
    })
    await h.main.request('command/execute', { id: 'demo.panel4' })
    const panelId = (panelsOf(h, 'panel/open')[0] as { id: string }).id
    expect(disposed).toBe(0)
    await h.main.request('panel/dispose', { panelId })
    expect(disposed).toBe(1)
  })
})

// ── Documentos del editor (reales) ────────────────────────────────────────

const DOC = {
  kind: 'open' as const,
  document: {
    path: '/tmp/workspace/src/a.ts',
    languageId: 'typescript',
    text: 'const a = 1\nconst b = 2\n',
    version: 3,
    dirty: true,
    eol: '\n' as const
  }
}

async function bootedWithDocs(
  documents: unknown[],
  entry?: { activate?: (api: any) => void }
): Promise<Harness> {
  const h = harness(entry)
  await h.ready
  await h.main.request('init', { ...INIT, documents })
  await h.main.request('activate')
  return h
}

describe('workspace.textDocuments: real', () => {
  it('el snapshot que viene en `init` está ANTES de activate', async () => {
    let duringActivate: any
    const h = await bootedWithDocs([DOC], {
      activate: (api) => {
        duringActivate = api.workspace.textDocuments[0]
      }
    })
    expect(duringActivate).toBeDefined()
    expect(duringActivate.fileName).toBe('/tmp/workspace/src/a.ts')
    expect(duringActivate.languageId).toBe('typescript')
    expect(duringActivate.getText()).toBe(DOC.document.text)
    expect(duringActivate.isDirty).toBe(true)
    expect(h.api().workspace.textDocuments).toHaveLength(1)
  })

  it('Position/Range/TextLine funcionan sobre el documento', async () => {
    const h = await bootedWithDocs([DOC])
    const api = h.api()
    const doc = api.workspace.textDocuments[0]

    expect(doc.lineCount).toBe(3)
    expect(doc.lineAt(1).text).toBe('const b = 2')
    expect(doc.offsetAt(new api.Position(1, 0))).toBe(12)
    expect(doc.positionAt(12)).toMatchObject({ line: 1, character: 0 })
    expect(doc.getText(new api.Range(0, 6, 0, 7))).toBe('a')
    expect(doc.getText(new api.Range(0, 6, 1, 7))).toBe('a = 1\nconst b')
    expect(doc.getWordRangeAtPosition(new api.Position(0, 6)).start.character).toBe(6)
    expect(doc.validatePosition(new api.Position(99, 99))).toMatchObject({ line: 2 })
  })

  it('los eventos del editor llegan: change, save, close y active', async () => {
    const seen: string[] = []
    const h = await bootedWithDocs([DOC], {
      activate: (api) => {
        api.workspace.onDidOpenTextDocument((e: any) => seen.push(`open:${e.document.fileName}`))
        api.workspace.onDidChangeTextDocument((e: any) => seen.push(`change:${e.contentChanges.length}`))
        api.workspace.onDidSaveTextDocument((e: any) => seen.push(`save:${e.document.isDirty}`))
        api.workspace.onDidCloseTextDocument((e: any) => seen.push(`close:${e.document.fileName}`))
        api.window.onDidChangeActiveTextEditor((editor: any) =>
          seen.push(`active:${editor?.document.fileName ?? 'ninguno'}`)
        )
      }
    })

    h.main.emit('doc/change', {
      kind: 'change',
      document: { ...DOC.document, text: 'const a = 9\nconst b = 2\n', version: 4 }
    })
    h.main.emit('doc/save', { kind: 'save', path: DOC.document.path, version: 5 })
    h.main.emit('doc/active', {
      kind: 'active',
      path: DOC.document.path,
      selection: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } }
    })

    expect(seen).toEqual(['change:1', 'save:false', `active:${DOC.document.path}`])
    const doc = h.api().workspace.textDocuments[0]
    // El MISMO objeto (las extensiones guardan referencias) con datos nuevos.
    expect(doc.getText()).toBe('const a = 9\nconst b = 2\n')
    expect(doc.version).toBe(5)
    expect(doc.isDirty).toBe(false)
    expect(h.api().window.activeTextEditor.document).toBe(doc)
    expect(h.api().window.activeTextEditor.selection.start).toMatchObject({ line: 1, character: 2 })

    h.main.emit('doc/close', { kind: 'close', path: DOC.document.path })
    expect(h.api().workspace.textDocuments).toHaveLength(0)
    expect(seen).toContain(`close:${DOC.document.path}`)
  })

  it('save() escribe con el jail del main y no miente si falla', async () => {
    let denied = true
    const h = await bootedWithDocs([DOC])
    h.main.handle('fs/write', () =>
      denied ? { success: false, error: 'fuera del workspace' } : { success: true }
    )
    const doc = h.api().workspace.textDocuments[0]

    await expect(doc.save()).resolves.toBe(false)
    expect(doc.isDirty).toBe(true)

    denied = false
    await expect(doc.save()).resolves.toBe(true)
    expect(doc.isDirty).toBe(false)
  })

  it('findFiles pide al main y devuelve Uris; avisa si la lista se cortó', async () => {
    const h = await booted({
      activate: (api) => {
        api.commands.registerCommand('demo.buscar', () => api.workspace.findFiles('**/*.ts'))
      }
    })
    h.main.handle('workspace/find', () => ({
      paths: ['/tmp/workspace/src/a.ts', '/tmp/workspace/src/b.ts'],
      truncated: false
    }))

    const uris = await h.main.request('command/execute', { id: 'demo.buscar' })
    expect(uris).toHaveLength(2)
    expect(uris[0].fsPath).toBe('/tmp/workspace/src/a.ts')

    const logs = payloadsOf(h.events, 'log') as Array<{ message: string }>
    expect(logs.every((l) => !l.message.includes('se cortó'))).toBe(true)
  })

  it('openTextDocument lee del disco (jail) si el archivo no está abierto', async () => {
    const h = await booted({
      activate: (api) => {
        api.commands.registerCommand('demo.abrirDoc', () =>
          api.workspace.openTextDocument('/tmp/workspace/src/nuevo.rs')
        )
      }
    })
    h.main.handle('fs/read', () => ({ success: true, value: 'fn main() {}' }))

    const doc = await h.main.request('command/execute', { id: 'demo.abrirDoc' })
    expect(doc.languageId).toBe('rust')
    expect(doc.getText()).toBe('fn main() {}')
    expect(h.api().workspace.textDocuments).toHaveLength(1)
  })

  it('showTextDocument le pide al IDE abrir el archivo y devuelve su editor', async () => {
    const h = await bootedWithDocs([DOC], {
      activate: (api) => {
        api.commands.registerCommand('demo.mostrar', () =>
          api.window.showTextDocument(api.Uri.file('/tmp/workspace/src/a.ts'))
        )
      }
    })
    h.main.handle('editor/open', () => ({ success: true }))

    const editor = await h.main.request('command/execute', { id: 'demo.mostrar' })
    expect(editor.document.fileName).toBe('/tmp/workspace/src/a.ts')
  })

  it('registerTextEditorCommand corre con el editor activo y sin él no corre', async () => {
    const h = await bootedWithDocs([DOC], {
      activate: (api) => {
        api.commands.registerTextEditorCommand('demo.editorCmd', (editor: any) =>
          `editando ${editor.document.fileName}`
        )
      }
    })
    h.main.emit('doc/active', { kind: 'active', path: DOC.document.path })
    await expect(h.main.request('command/execute', { id: 'demo.editorCmd' })).resolves.toBe(
      `editando ${DOC.document.path}`
    )

    h.main.emit('doc/active', { kind: 'active', path: null })
    await expect(h.main.request('command/execute', { id: 'demo.editorCmd' })).resolves.toBeUndefined()
  })
})

// ── Decoraciones del editor (el IDE las pinta) ────────────────────────────

/**
 * `window.createTextEditorDecorationType` + `editor.setDecorations`.
 *
 * Esto era INERTE hasta hace poco: el tipo se creaba vacío, `setDecorations`
 * no existía y una extensión que subrayaba rangos moría con "is not a
 * function". Acá se prueba contra el host REAL: lo que afirma cada test es el
 * payload que viaja a la UI (estilo + color ya traducidos), no la llamada.
 */
describe('editor.setDecorations: real', () => {
  /** Entradas del último `decorations/set` (archivo → rangos). */
  function lastEntries(h: Harness): Array<{ path: string; decorations: any[] }> {
    const payloads = payloadsOf(h.events, 'decorations/set') as Array<{
      entries: Array<{ path: string; decorations: any[] }>
    }>
    return payloads.at(-1)?.entries ?? []
  }

  /** Host con el documento abierto y activo (hay editor activo que decorar). */
  async function withActiveDoc(): Promise<Harness> {
    const h = await bootedWithDocs([DOC])
    h.main.emit('doc/active', { kind: 'active', path: DOC.document.path })
    return h
  }

  it('traduce la cadena de VS Code a estilo + color del motor', async () => {
    const h = await withActiveDoc()
    const api = h.api()
    const type = api.window.createTextEditorDecorationType({
      textEditorDecorationType: 'underline wavy red'
    })
    api.window.activeTextEditor.setDecorations(type, [new api.Range(0, 6, 0, 7)])

    expect(lastEntries(h)).toEqual([
      {
        path: DOC.document.path,
        decorations: [{ startLine: 0, startCol: 6, endLine: 0, endCol: 7, style: 0, color: 0xff0000ff }]
      }
    ])
  })

  it('acepta `DecorationOptions[]` con hoverMessage y reemplaza al re-setear', async () => {
    const h = await withActiveDoc()
    const api = h.api()
    const type = api.window.createTextEditorDecorationType({ textDecoration: 'underline' })
    const editor = api.window.activeTextEditor

    editor.setDecorations(type, [
      { range: new api.Range(1, 0, 1, 3), hoverMessage: 'import sin usar' }
    ])
    expect(lastEntries(h)[0].decorations[0]).toMatchObject({ startLine: 1, message: 'import sin usar' })

    // Volver a setear REEMPLAZA (como VS Code): no se acumulan subrayados.
    editor.setDecorations(type, [new api.Range(2, 0, 2, 1)])
    expect(lastEntries(h)[0].decorations).toHaveLength(1)
    expect(lastEntries(h)[0].decorations[0]).toMatchObject({ startLine: 2 })
  })

  it('una lista vacía (y el dispose del tipo) limpia lo pintado', async () => {
    const h = await withActiveDoc()
    const api = h.api()
    const type = api.window.createTextEditorDecorationType({ textDecoration: 'dotted' })
    const editor = api.window.activeTextEditor

    editor.setDecorations(type, [new api.Range(0, 0, 0, 5)])
    expect(lastEntries(h)[0].decorations).toHaveLength(1)

    editor.setDecorations(type, [])
    // El archivo VIAJA igual, con la lista vacía: ese `[]` es lo que borra el
    // subrayado en la UI (omitirlo lo dejaría pintado para siempre).
    expect(lastEntries(h)).toEqual([{ path: DOC.document.path, decorations: [] }])

    editor.setDecorations(type, [new api.Range(0, 0, 0, 5)])
    type.dispose()
    expect(lastEntries(h)).toEqual([{ path: DOC.document.path, decorations: [] }])
  })

  it('un rango sin los cuatro números no se manda (no se inventa un rango)', async () => {
    const h = await withActiveDoc()
    const api = h.api()
    const type = api.window.createTextEditorDecorationType({ textDecoration: 'underline' })
    api.window.activeTextEditor.setDecorations(type, [{ start: { line: 1 } }])
    expect(lastEntries(h)).toEqual([{ path: DOC.document.path, decorations: [] }])
  })
})

// ── Proveedores de lenguaje (lo que el IDE pregunta) ──────────────────────

describe('proveedores de lenguaje: el IDE consulta de verdad', () => {
  it('hover: el proveedor de la extensión responde por `provider/query`', async () => {
    const h = await bootedWithDocs([DOC], {
      activate: (api) => {
        api.languages.registerHoverProvider('typescript', {
          provideHover: (document: any, position: any) => ({
            // Todas las formas del API en un mismo hover: string, MarkdownString
            // y el array que la UI antes pintaba vacío.
            contents: [`**${document.languageId}**`, { value: `línea ${position.line + 1}` }],
            range: new api.Range(position.line, 0, position.line, 4)
          })
        })
      }
    })

    const answer = (await h.main.request('provider/query', {
      kind: 'hover',
      path: DOC.document.path,
      position: { line: 2, character: 1 }
    })) as { matched: boolean; result: any }

    expect(answer.matched).toBe(true)
    expect(answer.result.contents.value).toBe('**typescript**\n\nlínea 3')
    expect(answer.result.range).toEqual({
      start: { line: 2, character: 0 },
      end: { line: 2, character: 4 }
    })
  })

  it('sin proveedor que atienda el documento, `matched` es false', async () => {
    const h = await bootedWithDocs([DOC], {
      activate: (api) => {
        api.languages.registerHoverProvider('python', { provideHover: () => ({ contents: 'py' }) })
      }
    })
    await expect(
      h.main.request('provider/query', {
        kind: 'hover',
        path: DOC.document.path,
        position: { line: 0, character: 0 }
      })
    ).resolves.toEqual({ matched: false, result: null })
  })

  it('formateo: el proveedor recibe el documento REAL y sus opciones', async () => {
    const h = await bootedWithDocs([DOC], {
      activate: (api) => {
        api.languages.registerDocumentFormattingEditProvider('typescript', {
          provideDocumentFormattingEdits: (document: any, options: any) => [
            // El texto REAL del buffer (no una ruta): si esto no llega, un
            // formateador no puede hacer nada.
            new api.TextEdit(new api.Range(0, 0, 0, document.getText().length), `tab=${options.tabSize}`)
          ]
        })
      }
    })

    const answer = (await h.main.request('provider/query', {
      kind: 'formatting',
      path: DOC.document.path,
      options: { tabSize: 4 }
    })) as { result: Array<{ newText: string; range: any }> }

    expect(answer.result).toHaveLength(1)
    expect(answer.result[0].newText).toBe('tab=4')
    expect(answer.result[0].range.start).toEqual({ line: 0, character: 0 })
  })

  it('un archivo que NO está abierto se lee del disco para el proveedor', async () => {
    // El caso real de "ir a la definición" a otro archivo: no está en el
    // editor, así que el host lo pide al main (jail incluido) y le da al
    // proveedor un `TextDocument` de verdad en vez de `undefined`.
    const h = await bootedWithDocs([DOC], {
      activate: (api) => {
        api.languages.registerDefinitionProvider('typescript', {
          provideDefinition: (document: any) => [
            new api.Location(api.Uri.file(`${document.fileName}.d.ts`), new api.Range(0, 0, 0, 1))
          ]
        })
      }
    })
    h.main.handle('fs/read', (raw: any) => ({
      success: true,
      value: raw.path === '/tmp/workspace/src/otro.ts' ? 'const otro = 1\n' : ''
    }))

    const answer = (await h.main.request('provider/query', {
      kind: 'definition',
      path: '/tmp/workspace/src/otro.ts',
      position: { line: 0, character: 6 }
    })) as { matched: boolean; result: Array<{ uri: string; range: unknown }> }

    expect(answer.matched).toBe(true)
    expect(answer.result).toEqual([
      {
        uri: 'file:///tmp/workspace/src/otro.ts.d.ts',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
      }
    ])
  })

  it('los proveedores sin UI quedan inertes y lo DICEN (no un no-op mudo)', async () => {
    const h = await booted({
      activate: (api) => {
        api.languages.registerCompletionItemProvider('typescript', { provideCompletionItems: () => [] })
      }
    })
    const logs = payloadsOf(h.events, 'log') as Array<{ level: string; message: string }>
    expect(
      logs.some(
        (log) => log.level === 'warn' && log.message.includes('registerCompletionItemProvider')
      )
    ).toBe(true)
  })
})

// ── Globs de findFiles ────────────────────────────────────────────────────

describe('globs de findFiles', () => {
  it('matchea por ruta relativa, por nombre suelto y con llaves', async () => {
    const { matchesGlob } = await import('../src/main/extensions/host/globs')
    expect(matchesGlob('**/*.ts', 'src/a.ts')).toBe(true)
    expect(matchesGlob('**/*.ts', 'src/deep/x/y/a.ts')).toBe(true)
    expect(matchesGlob('src/**/*.css', 'src/x/y/z.css')).toBe(true)
    expect(matchesGlob('src/**/*.css', 'otro/x.css')).toBe(false)
    expect(matchesGlob('**/*.{ts,tsx}', 'src/app.tsx')).toBe(true)
    expect(matchesGlob('**/*.{ts,tsx}', 'src/app.vue')).toBe(false)
    // Sin `/`: se compara contra el nombre, como en VS Code.
    expect(matchesGlob('package.json', 'sub/dir/package.json')).toBe(true)
    expect(matchesGlob('*.md', 'docs/leeme.md')).toBe(true)
    expect(matchesGlob('a?.txt', 'ab.txt')).toBe(true)
  })
})

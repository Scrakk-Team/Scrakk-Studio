/**
 * Paneles de webview en el ÁREA DEL EDITOR (`window.createWebviewPanel`).
 *
 * Es el otro sabor de webview de VS Code (además de la vista de la activity
 * bar): la extensión publica HTML y el IDE lo abre como una TAB del editor.
 * Sirve lo mismo que en las vistas — el HTML se sirve por
 * `scrakk-ext://<extension>/panel/<id>` con el mismo CSP y el mismo shim de
 * `acquireVsCodeApi()`, así que una extensión no escribe dos webviews distintos.
 *
 * Los ids van prefijados con `panel:` para que el ruteo de mensajes no pueda
 * confundir un panel con una vista de la activity bar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Igual que el resto del shim: sólo habla `HostBridge`. La tab la dibuja el
 * renderer; si Owear cambia el sistema de paneles, se cambia ese renderer.
 */

import { Disposable, EventEmitter, Uri } from './vscodeShim'
import type { WebviewPanelModel, LogPayload } from '@shared/extensionHost/protocol'

/** Lo que un panel necesita del host. */
export interface WebviewPanelBridge {
  pushPanel(model: WebviewPanelModel): void
  pushPanelHtml(id: string, html: string): void
  /** Mensaje de la extensión hacia el iframe del panel. */
  pushPanelMessage(id: string, message: unknown): void
  pushPanelClose(id: string): void
  asWebviewUri(absolutePath: string): string
  log(level: LogPayload['level'], message: string): void
}

/** `ViewColumn` de VS Code (los ids numéricos; Active = -1). */
export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  Seven: 7,
  Eight: 8,
  Nine: 9
} as const

export interface WebviewPanelOptionsLike {
  enableScripts?: boolean
  retainContextWhenHidden?: boolean
  enableFindWidget?: boolean
}

export class WebviewPanelHandle {
  private titleValue: string
  private htmlValue = ''
  private visibleValue = true
  private disposed = false
  private iconPathValue: unknown

  private readonly disposeEmitter = new EventEmitter<void>()
  private readonly viewStateEmitter = new EventEmitter<{ visible: boolean }>()
  private readonly messageEmitter = new EventEmitter<unknown>()

  readonly webview: {
    html: string
    options: WebviewPanelOptionsLike
    cspSource: string
    asWebviewUri: (uri: Uri) => Uri
    postMessage: (message: unknown) => Promise<boolean>
    onDidReceiveMessage: (listener: (message: unknown) => void) => Disposable
  }

  constructor(
    readonly id: string,
    readonly viewType: string,
    initialTitle: string,
    initialViewColumn: number,
    private readonly extensionId: string,
    private readonly bridge: WebviewPanelBridge,
    webviewOptions: WebviewPanelOptionsLike = {}
  ) {
    this.titleValue = initialTitle
    this.viewColumn = initialViewColumn
    // `host` capturado para los getters/setters del literal (ahí `this` es el
    // propio literal, no la instancia) — mismo patrón que `WebviewViewHandle`.
    const host = this
    this.webview = {
      get html(): string {
        return host.htmlValue
      },
      set html(value: string) {
        host.htmlValue = value
        host.bridge.pushPanelHtml(host.id, value)
        host.bridge.log('info', `panel "${host.id}" publicó HTML (${value.length} bytes)`)
      },
      options: webviewOptions,
      cspSource: 'scrakk-ext:',
      asWebviewUri: (uri: Uri): Uri => Uri.parse(host.bridge.asWebviewUri(uri.path)),
      postMessage: async (message: unknown): Promise<boolean> => {
        // Misma ruta que el iframe de las vistas: el renderer filtra por id.
        host.bridge.pushPanelMessage(host.id, message)
        return true
      },
      onDidReceiveMessage: (listener: (message: unknown) => void): Disposable =>
        host.messageEmitter.event(listener)
    }
  }

  /** Columna pedida por la extensión (el IDE la usa como sugerencia). */
  viewColumn: number

  get title(): string {
    return this.titleValue
  }

  set title(value: string) {
    if (value === this.titleValue) return
    this.titleValue = value
    this.bridge.pushPanel(this.model())
  }

  get visible(): boolean {
    return this.visibleValue
  }

  set visible(value: boolean) {
    this.visibleValue = value
    this.bridge.pushPanel(this.model())
    this.viewStateEmitter.fire({ visible: value })
  }

  get active(): boolean {
    return this.visibleValue
  }

  get iconPath(): unknown {
    return this.iconPathValue
  }

  set iconPath(value: unknown) {
    this.iconPathValue = value
  }

  readonly onDidDispose = (listener: () => void): Disposable => this.disposeEmitter.event(listener)

  readonly onDidChangeViewState = (
    listener: (event: { webviewPanel: WebviewPanelHandle; visible: boolean; active: boolean }) => void
  ): Disposable =>
    this.viewStateEmitter.event((state) =>
      listener({ webviewPanel: this, visible: state.visible, active: state.visible })
    )

  /** Entrega un mensaje que vino del iframe del panel. */
  deliver(message: unknown): void {
    this.messageEmitter.fire(message)
  }

  reveal(_viewColumn?: number, _preserveFocus?: boolean): void {
    if (this.disposed) return
    this.visibleValue = true
    this.bridge.pushPanel(this.model())
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.bridge.pushPanelClose(this.id)
    this.disposeEmitter.fire()
    this.disposeEmitter.dispose()
    this.viewStateEmitter.dispose()
    this.messageEmitter.dispose()
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  model(): WebviewPanelModel {
    return {
      id: this.id,
      extensionId: this.extensionId,
      title: this.titleValue,
      viewColumn: this.viewColumn,
      visible: this.visibleValue,
      hasHtml: this.htmlValue.length > 0
    }
  }
}

export class WebviewPanelRegistry {
  private readonly panels = new Map<string, WebviewPanelHandle>()
  private counter = 0

  constructor(
    private readonly extensionId: string,
    private readonly bridge: WebviewPanelBridge
  ) {}

  create(
    viewType: string,
    title: string,
    viewColumn: unknown,
    options?: { viewColumn?: unknown; preserveFocus?: boolean } & WebviewPanelOptionsLike
  ): WebviewPanelHandle {
    const id = `panel:${this.extensionId}#${++this.counter}`
    const column =
      typeof viewColumn === 'number'
        ? viewColumn
        : typeof options?.viewColumn === 'number'
          ? options.viewColumn
          : ViewColumn.One
    const panel = new WebviewPanelHandle(id, viewType, title, column, this.extensionId, this.bridge, {
      enableScripts: options?.enableScripts ?? true,
      retainContextWhenHidden: options?.retainContextWhenHidden ?? false
    })
    this.panels.set(id, panel)
    // El modelo va PRIMERO que el HTML: la UI necesita la tab para montar el
    // iframe que después pide el documento por `scrakk-ext://`.
    this.bridge.pushPanel(panel.model())
    return panel
  }

  get(id: string): WebviewPanelHandle | undefined {
    return this.panels.get(id)
  }

  ids(): string[] {
    return [...this.panels.keys()]
  }

  deliver(id: string, message: unknown): boolean {
    const panel = this.panels.get(id)
    if (!panel) return false
    panel.deliver(message)
    return true
  }

  disposeAll(): void {
    // Se copia: `dispose()` avisa al bridge y no muta el Map, pero así no se
    // itera sobre algo que otro listener pueda tocar.
    for (const panel of [...this.panels.values()]) panel.dispose()
    this.panels.clear()
  }
}

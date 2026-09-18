/**
 * Tree data providers — el otro sabor de panel de la activity bar.
 *
 * La mitad de las extensiones de VS Code NO publican HTML: sirven un ÁRBOL
 * (`window.registerTreeDataProvider` / `createTreeView`). El IDE pinta los
 * nodos y la extensión sólo dice cómo se llaman y qué hijos tienen.
 *
 * Este módulo es el registro de esos providers y el traductor
 * `TreeItem` → `TreeNodeModel` (el modelo serializable que come el renderer).
 * La UI NO recibe los elementos originales: los guarda acá y los referencia
 * por un `id` opaco, porque los argumentos de un `TreeItem.command` (un `Uri`,
 * por ejemplo) no sobreviven a la serialización y las extensiones los esperan
 * intactos al clickear.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Igual que el resto del host: esto NO sabe de Node, ni de stdio, ni de
 * Electron. Sólo habla `TreeBridge` (que implementa el runtime del host).
 */

import type { TreeNodeModel } from '@shared/extensionHost/protocol'
import { Disposable } from './vscodeShim'

/** Evento inerte: existe (para que `activate()` no explote) pero no dispara. */
function noopEvent<T = unknown>(): (listener: (event: T) => void) => Disposable {
  return () => new Disposable(() => undefined)
}

// ── Primitivas del API de árboles ─────────────────────────────────────────

/** Mismo valor numérico que VS Code (las extensiones comparan contra esto). */
export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2
} as const

export type TreeItemCollapsibleStateValue = 0 | 1 | 2

/** `vscode.ThemeIcon`: identifica un icono con nombre (codicon). */
export class ThemeIcon {
  constructor(
    readonly id: string,
    readonly color?: unknown
  ) {}
}

export interface TreeItemCommand {
  command: string
  title?: string
  arguments?: unknown[]
}

export interface TreeItemLabelWithHighlights {
  label: string
  highlights?: [number, number][]
}

/**
 * `vscode.TreeItem`. Sólo la parte que el IDE usa para pintar: identidad,
 * texto, hijos, icono y comando. Lo que no se usa (checkboxState,
 * accessibilityInformation, …) se acepta y se ignora en lugar de fallar,
 * porque las extensiones los setean sin preguntar.
 */
export class TreeItem {
  id?: string
  label?: string | TreeItemLabelWithHighlights
  description?: string | boolean
  tooltip?: unknown
  contextValue?: string
  iconPath?: unknown
  resourceUri?: unknown
  command?: TreeItemCommand
  collapsibleState?: TreeItemCollapsibleStateValue

  constructor(
    labelOrResource?: string | TreeItemLabelWithHighlights | unknown,
    collapsibleState?: TreeItemCollapsibleStateValue
  ) {
    if (typeof labelOrResource === 'string' || (labelOrResource && typeof labelOrResource === 'object' && 'label' in labelOrResource)) {
      this.label = labelOrResource as string | TreeItemLabelWithHighlights
    } else if (labelOrResource) {
      // Constructor con Uri: VS lo usa para derivar icono y etiqueta.
      this.resourceUri = labelOrResource
    }
    this.collapsibleState = collapsibleState
  }
}

/** `vscode.TreeDataProvider` (sólo lo que consumimos). */
export interface TreeDataProviderLike {
  getChildren(element?: unknown): unknown[] | Promise<unknown[]>
  getTreeItem?(element: unknown): unknown
  onDidChangeTreeData?: (listener: (element?: unknown) => void) => Disposable
}

export interface TreeViewOptionsLike {
  treeDataProvider: TreeDataProviderLike
  showCollapseAll?: boolean
  canSelectMany?: boolean
}

/**
 * Lo que devuelve `createTreeView`. Es una interfaz (no la clase `Disposable`)
 * porque el handle se arma como objeto plano y las extensiones sólo lo tratan
 * estructuralmente (`dispose`, `title`, …).
 *
 * Los eventos de selección/expansión existen como eventos INERTES: las
 * extensiones se suscriben a ellos en `activate()` y, si no están, la
 * activación explota con "onDidExpandElement is not a function" (medido con
 * Comment Anchors). El IDE todavía no los dispara.
 */
export interface TreeViewHandleLike {
  readonly viewId: string
  title: string
  description?: string
  visible: boolean
  message?: string
  badge?: unknown
  selection: unknown[]
  reveal?(element: unknown, options?: unknown): Promise<void>
  onDidExpandElement: (listener: (event: unknown) => void) => Disposable
  onDidCollapseElement: (listener: (event: unknown) => void) => Disposable
  onDidChangeSelection: (listener: (event: unknown) => void) => Disposable
  onDidChangeVisibility: (listener: (event: { visible: boolean }) => void) => Disposable
  dispose(): void
}

// ── Puente (lo que el registro necesita del runtime) ──────────────────────

export interface TreeBridge {
  /** Publica los nodos RAÍZ de la vista. */
  pushTree(viewId: string, nodes: TreeNodeModel[]): void
  /** Avisa que hay que refrescar (undefined = toda la vista). */
  pushTreeChange(viewId: string, elementId?: string): void
  /** Ruta absoluta del paquete → URL servible por el webview. */
  asWebviewUri(absolutePath: string): string
  log(level: 'log' | 'info' | 'warn' | 'error', message: string): void
}

export interface TreeViewRegistryOptions {
  bridge: TreeBridge
  /** Raíz del paquete (para resolver iconos declarados como ruta relativa). */
  extensionPath: string
}

// ── Registro ──────────────────────────────────────────────────────────────

/**
 * Registro de árboles de UNA extensión.
 *
 * Vive por host (una extensión = un host), así que no hace falta namespacing
 * por extensión: el `viewId` ya es global (`publisher.ext.vista`).
 */
export class TreeViewRegistry {
  private readonly providers = new Map<string, TreeDataProviderLike>()
  private readonly providerSubs = new Map<string, Disposable>()
  /** id opaco → elemento original que devolvió la extensión. */
  private readonly elements = new Map<string, unknown>()
  /** elemento → id opaco (para resolver `onDidChangeTreeData(element)`). */
  private readonly keysByElement = new Map<unknown, string>()

  constructor(private readonly options: TreeViewRegistryOptions) {}

  has(viewId: string): boolean {
    return this.providers.has(viewId)
  }

  viewIds(): string[] {
    return [...this.providers.keys()]
  }

  /** `window.registerTreeDataProvider`. */
  register(viewId: string, provider: TreeDataProviderLike): Disposable {
    this.set(viewId, provider)
    return new Disposable(() => this.dispose(viewId))
  }

  /** `window.createTreeView`. */
  create(viewId: string, options: TreeViewOptionsLike, title = ''): TreeViewHandleLike {
    this.set(viewId, options.treeDataProvider)
    let disposed = false
    const registry = this
    return {
      viewId,
      title,
      visible: false,
      selection: [],
      onDidExpandElement: noopEvent(),
      onDidCollapseElement: noopEvent(),
      onDidChangeSelection: noopEvent(),
      onDidChangeVisibility: noopEvent(),
      dispose: () => {
        if (disposed) return
        disposed = true
        registry.dispose(viewId)
      }
    }
  }

  private set(viewId: string, provider: TreeDataProviderLike): void {
    this.providerSubs.get(viewId)?.dispose()
    this.providers.set(viewId, provider)

    const subscription = provider.onDidChangeTreeData?.((element?: unknown) => {
      const elementId =
        element === undefined || element === null ? undefined : this.keysByElement.get(element)
      this.options.bridge.pushTreeChange(viewId, elementId)
    })
    if (subscription) this.providerSubs.set(viewId, subscription)
    this.options.bridge.log('info', `tree data provider registrado: ${viewId}`)
  }

  dispose(viewId: string): void {
    this.providerSubs.get(viewId)?.dispose()
    this.providerSubs.delete(viewId)
    this.providers.delete(viewId)
    for (const [key] of this.elements) {
      if (key.startsWith(`${viewId}#`)) {
        this.keysByElement.delete(this.elements.get(key))
        this.elements.delete(key)
      }
    }
  }

  disposeAll(): void {
    for (const viewId of [...this.providers.keys()]) this.dispose(viewId)
  }

  /** Nodos raíz (y snapshot para el renderer al resolver la vista). */
  async root(viewId: string): Promise<TreeNodeModel[]> {
    return await this.children(viewId, null)
  }

  /** Hijos de un nodo (`null` = raíz). */
  async children(viewId: string, elementId: string | null): Promise<TreeNodeModel[]> {
    const provider = this.providers.get(viewId)
    if (!provider) throw new Error(`la extensión no registró un árbol para "${viewId}"`)

    let parent: unknown
    const parentKey = elementId ?? viewId
    if (elementId) {
      if (!this.elements.has(elementId)) {
        // El nodo ya no existe (la extensión refrescó): raíz vacía en vez de
        // romper el panel entero.
        this.options.bridge.log('warn', `nodo desconocido en "${viewId}": ${elementId}`)
        return []
      }
      parent = this.elements.get(elementId)
    }

    const raw = await provider.getChildren(parent)
    const list = Array.isArray(raw) ? raw : []
    const nodes: TreeNodeModel[] = []

    for (const [index, element] of list.entries()) {
      // VS Code SIEMPRE pasa el elemento por `getTreeItem` (cuando existe),
      // aunque ya sea un TreeItem: la extensión puede envolverlo.
      let item: unknown = element
      if (provider.getTreeItem) {
        try {
          item = await provider.getTreeItem(element)
        } catch (error) {
          item = element
          this.options.bridge.log(
            'warn',
            `getTreeItem falló en "${viewId}": ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
      const node = this.toNode(item, element, index, parentKey)
      if (!node) continue
      this.elements.set(node.id, item)
      this.keysByElement.set(item, node.id)
      nodes.push(node)
    }

    return nodes
  }

  /** Click en un nodo: corre el comando del item con sus argumentos REALES. */
  async select(viewId: string, elementId: string): Promise<TreeItemCommand | null> {
    const item = this.elements.get(elementId)
    if (!item) throw new Error(`nodo desconocido en "${viewId}": ${elementId}`)
    const command = (item as { command?: TreeItemCommand }).command
    if (!command || typeof command.command !== 'string') return null
    return command
  }

  /** Elemento original de un id opaco (para `executeCommand`). */
  elementOf(elementId: string): unknown {
    return this.elements.get(elementId)
  }

  // ── Serialización ───────────────────────────────────────────────────────

  private toNode(
    item: unknown,
    fallbackElement: unknown,
    index: number,
    parentKey: string
  ): TreeNodeModel | null {
    if (!item || typeof item !== 'object') return null
    const raw = item as TreeItem

    const localId =
      typeof raw.id === 'string' && raw.id.length > 0
        ? raw.id
        : typeof (fallbackElement as { id?: unknown })?.id === 'string'
          ? String((fallbackElement as { id: string }).id)
          : String(index)
    let id = `${parentKey}#${localId}`
    if (this.elements.has(id)) id = `${parentKey}#${localId}~${index}`

    const label = this.labelOf(raw, fallbackElement)
    const node: TreeNodeModel = {
      id,
      label,
      collapsible: (raw.collapsibleState ?? TreeItemCollapsibleState.None) as 0 | 1 | 2
    }

    if (typeof raw.description === 'string' && raw.description.length > 0) {
      node.description = raw.description
    }
    const tooltip = this.tooltipOf(raw.tooltip)
    if (tooltip) node.tooltip = tooltip
    if (typeof raw.contextValue === 'string') node.contextValue = raw.contextValue
    const icon = this.iconOf(raw.iconPath)
    if (icon) node.icon = icon
    if (raw.command && typeof raw.command.command === 'string') node.command = raw.command.command

    return node
  }

  private labelOf(item: TreeItem, fallbackElement: unknown): string {
    if (typeof item.label === 'string') return item.label
    if (item.label && typeof item.label === 'object' && typeof item.label.label === 'string') {
      return item.label.label
    }
    const resource = (item.resourceUri ?? fallbackElement) as { path?: unknown; fsPath?: unknown }
    const rawPath = typeof resource?.fsPath === 'string' ? resource.fsPath : resource?.path
    if (typeof rawPath === 'string' && rawPath.length > 0) {
      const parts = rawPath.replace(/\/+$/, '').split('/')
      return parts[parts.length - 1] ?? rawPath
    }
    return ''
  }

  private tooltipOf(tooltip: unknown): string | undefined {
    if (typeof tooltip === 'string') return tooltip
    if (tooltip && typeof tooltip === 'object' && 'value' in tooltip) {
      const value = (tooltip as { value?: unknown }).value
      if (typeof value === 'string') return value
    }
    return undefined
  }

  /** Icono → `url` (asset del paquete) o `theme` (ThemeIcon/codicon). */
  private iconOf(iconPath: unknown): TreeNodeModel['icon'] {
    if (!iconPath) return undefined
    if (iconPath instanceof ThemeIcon) return { kind: 'theme', id: iconPath.id }
    if (typeof iconPath === 'string') {
      const absolute = iconPath.startsWith('/')
        ? iconPath
        : `${this.options.extensionPath}/${iconPath}`
      return { kind: 'url', url: this.options.bridge.asWebviewUri(absolute) }
    }
    if (typeof iconPath === 'object') {
      const candidate = iconPath as { id?: unknown; dark?: unknown; light?: unknown; fsPath?: unknown }
      // ThemeIcon de otra copia del shim, o `new ThemeIcon(...)` sin instanceof.
      if (typeof candidate.id === 'string' && !candidate.dark && !candidate.light) {
        return { kind: 'theme', id: candidate.id }
      }
      const variant = candidate.dark ?? candidate.light
      if (typeof candidate.fsPath === 'string') {
        return { kind: 'url', url: this.options.bridge.asWebviewUri(candidate.fsPath) }
      }
      if (variant) return this.iconOf(variant)
    }
    return undefined
  }
}

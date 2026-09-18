/**
 * Barra de estado real: los items que la extensión crea los PINTA el IDE.
 *
 * `window.createStatusBarItem` es de las primeras cosas que hace una extensión
 * de paneles al activarse (contador de anclas, estado de conexión, versión…).
 * El item vive acá (estado del host) y cada mutación se empuja al renderer, que
 * lo dibuja con el lenguaje visual de sus propios chips. El click corre el
 * comando por el registry REAL del IDE.
 *
 * El `id` que ve la UI es `<extensionId>#<n>`: la extensión puede crear items
 * sin id (como VS Code, donde el id es opcional) y nosotros igual necesitamos
 * uno estable para poder actualizarlos y quitarlos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * No conoce la UI: empuja modelos por el bridge. Si Owear trae otra barra de
 * estado, se cambia el renderer del evento `status/item`, no esto.
 */

import type {
  StatusBarItemModel,
  StatusBarItemPayload,
  LogPayload
} from '@shared/extensionHost/protocol'
import { Disposable } from './vscodeShim'

/** Lo que el registro necesita del host para hablarle a la UI. */
export interface StatusBarBridge {
  pushStatusItem(item: StatusBarItemPayload): void
  log(level: LogPayload['level'], message: string): void
}

/** `StatusBarAlignment`: el número de VS Code (1 = left, 2 = right). */
export const StatusBarAlignment = { Left: 1, Right: 2 } as const

/**
 * Saca el codicon del texto (`$(bug) 3 problemas` → icono `bug` + resto).
 * VS Code lo renderiza igual; acá la UI necesita el icono aparte.
 */
export function splitCodicon(text: string): { icon?: string; text: string } {
  const match = /^\s*\$\(([a-zA-Z0-9-]+)\)\s*/.exec(text)
  if (!match) return { text }
  return { icon: match[1], text: text.slice(match[0].length) }
}

/** Texto plano de un tooltip (MarkdownString | string | undefined). */
export function tooltipText(tooltip: unknown): string | undefined {
  if (typeof tooltip === 'string') return tooltip || undefined
  if (tooltip && typeof tooltip === 'object' && 'value' in tooltip) {
    const value = (tooltip as { value?: unknown }).value
    if (typeof value === 'string') return value.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') || undefined
  }
  return undefined
}

/** Item de barra de estado con la forma del API de VS Code. */
export class StatusBarItemHandle {
  private textValue = ''
  private tooltipValue: string | undefined
  private commandValue: string | undefined
  private colorValue: string | undefined
  private backgroundColorValue: string | undefined
  private visible = false
  private disposed = false
  /** Debounce de updates: una extensión que escribe en un tick no spamea IPC. */
  private flushTimer: NodeJS.Timeout | null = null

  constructor(
    readonly id: string,
    private readonly extensionId: string,
    readonly alignment: number,
    readonly priority: number,
    private readonly bridge: StatusBarBridge,
    /** Id declarado por la extensión (el del manifest/settings), si lo hay. */
    private nameValue?: string
  ) {}

  get text(): string {
    return this.textValue
  }

  set text(value: string) {
    this.textValue = value ?? ''
    this.schedule()
  }

  get tooltip(): string | undefined {
    return this.tooltipValue
  }

  set tooltip(value: unknown) {
    this.tooltipValue = tooltipText(value)
    this.schedule()
  }

  get command(): string | undefined {
    return this.commandValue
  }

  set command(value: string | { command: string } | undefined) {
    this.commandValue =
      typeof value === 'string' ? value : value && typeof value === 'object' ? value.command : undefined
    this.schedule()
  }

  get color(): string | undefined {
    return this.colorValue
  }

  set color(value: string | { id: string } | undefined) {
    this.colorValue = typeof value === 'string' ? value : value?.id
    this.schedule()
  }

  get backgroundColor(): string | undefined {
    return this.backgroundColorValue
  }

  set backgroundColor(value: string | { id: string } | undefined) {
    this.backgroundColorValue = typeof value === 'string' ? value : value?.id
    this.schedule()
  }

  get name(): string | undefined {
    return this.nameValue
  }

  set name(value: string | undefined) {
    this.nameValue = value
    this.schedule()
  }

  /** `accessibilityInformation` no cambia lo que se ve: no se empuja. */
  accessibilityInformation: unknown = undefined

  // Mostrar/ocultar NO se debouncea: es un cambio que el usuario tiene que ver
  // ya, y además un `hide()` seguido de `dispose()` perdería el aviso (el
  // timer se cancela al disponer) — lo destapó un test, no la vista.
  show(): void {
    this.visible = true
    this.flush()
  }

  hide(): void {
    this.visible = false
    this.flush()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.bridge.pushStatusItem({ id: this.id, removed: true })
  }

  /** Modelo serializable para la UI (lo comparten `show` y cada update). */
  model(): StatusBarItemModel {
    const { icon, text } = splitCodicon(this.textValue)
    return {
      id: this.id,
      extensionId: this.extensionId,
      alignment: this.alignment === StatusBarAlignment.Right ? 'right' : 'left',
      priority: this.priority,
      text,
      ...(icon ? { icon } : {}),
      ...(this.tooltipValue ? { tooltip: this.tooltipValue } : {}),
      ...(this.commandValue ? { command: this.commandValue } : {}),
      ...(this.colorValue ? { color: this.colorValue } : {}),
      ...(this.backgroundColorValue ? { backgroundColor: this.backgroundColorValue } : {}),
      ...(this.nameValue ? { name: this.nameValue } : {}),
      visible: this.visible
    }
  }

  private schedule(): void {
    if (this.disposed) return
    // Sin debounce, un `text = ...` por frame (contador de anclas) satura el
    // IPC con un modelo completo por caracter.
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, 40)
  }

  /** Empuja ya (lo usa `show()`/`hide()` para que el cambio se vea al toque). */
  flush(): void {
    if (this.disposed) return
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.bridge.pushStatusItem(this.model())
  }
}

export class StatusBarRegistry {
  private readonly items = new Map<string, StatusBarItemHandle>()
  private counter = 0
  /** Mensajes temporales de `setStatusBarMessage` (no son items). */
  private messageTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly extensionId: string,
    private readonly bridge: StatusBarBridge
  ) {}

  create(alignment: unknown, priority: unknown, id?: string, name?: string): StatusBarItemHandle {
    const itemId = id && id.length > 0 ? id : `${this.extensionId}#${++this.counter}`
    const existing = this.items.get(itemId)
    if (existing) return existing
    const item = new StatusBarItemHandle(
      itemId,
      this.extensionId,
      typeof alignment === 'number' ? alignment : StatusBarAlignment.Left,
      typeof priority === 'number' ? priority : 0,
      this.bridge,
      name
    )
    this.items.set(itemId, item)
    return item
  }

  /**
   * `window.setStatusBarMessage`: mensaje TEMPORAL en la izquierda. Reusa un
   * item propio por extensión (el mensaje no tiene identidad propia, igual que
   * en VS Code, donde es el último que gana).
   */
  setMessage(text: string, hideAfterTimeoutOrThenable?: unknown): Disposable {
    const item = this.create(StatusBarAlignment.Left, -1, `${this.extensionId}#message`)
    item.text = text
    item.show()
    if (this.messageTimer) clearTimeout(this.messageTimer)
    this.messageTimer = null

    const hide = (): void => item.dispose()
    if (typeof hideAfterTimeoutOrThenable === 'number' && hideAfterTimeoutOrThenable > 0) {
      this.messageTimer = setTimeout(() => this.bridge.pushStatusItem({ id: item.id, removed: true }), hideAfterTimeoutOrThenable)
    } else if (
      hideAfterTimeoutOrThenable &&
      typeof (hideAfterTimeoutOrThenable as Promise<unknown>).then === 'function'
    ) {
      void (hideAfterTimeoutOrThenable as Promise<unknown>).then(hide, hide)
    }
    return new Disposable(() => {
      if (this.messageTimer) clearTimeout(this.messageTimer)
      this.messageTimer = null
      this.bridge.pushStatusItem({ id: item.id, removed: true })
    })
  }

  /** Al desactivar la extensión: sus items salen de la barra. */
  disposeAll(): void {
    for (const item of [...this.items.values()]) item.dispose()
    this.items.clear()
    if (this.messageTimer) clearTimeout(this.messageTimer)
    this.messageTimer = null
  }
}

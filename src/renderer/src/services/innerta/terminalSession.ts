/**
 * Sesión viva de terminal (Innerta · modo terminal).
 *
 * El objetivo: mover la tab de la terminal entre slots NO debe matar la
 * sesión. La sesión posee el canvas + la vista Innerta + el PTY; attach() /
 * detach() re-parentean el canvas (el módulo WASM y el PTY del main siguen
 * vivos), y solo dispose() (cerrar la tab) destruye todo.
 *
 * La lógica (PTY, flush de vterm, copy/paste, dims) es la que vivía en
 * InnertaTerminalPanel, extraída a una sesión reutilizable.
 */

import { createTerminalView, type InnertaViewHandle } from './viewFactory'
import type { LiveSession } from '@features/sessions'
import type { InnertaModule } from '@features/editor/engines/innerta/InnertaEngine'
import { wireInnertaInput } from '@features/editor/engines/innerta/innertaInput'
import { applyInnertaTheme, listenThemeChanges } from '@features/editor/engines/innerta/innertaTheme'
import type { ContextMenuItem } from '@ui'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'

/** API del terminal expuesta por el preload (window.api.terminal). */
interface TerminalApi {
  create: (req: { id: string; shell: string; cwd?: string; cols: number; rows: number }) => Promise<unknown>
  write: (req: { id: string; data: string }) => Promise<void>
  resize: (req: { id: string; cols: number; rows: number }) => Promise<void>
  destroy: (req: { id: string }) => Promise<void>
  onData: (cb: (payload: { id: string; data: string }) => void) => () => void
  onExit: (cb: (payload: { id: string; exitCode: number }) => void) => () => void
}

function getTerminalApi(): TerminalApi | null {
  return (
    (window as unknown as { api?: { terminal?: TerminalApi } }).api?.terminal ?? null
  )
}

/** Misma key que el Explorer/workspaces: raíz del proyecto abierto. */
const ROOT_KEY = 'scrakk-studio:root-path'

function readWorkspaceRoot(): string | undefined {
  try {
    return localStorage.getItem(ROOT_KEY) ?? undefined
  } catch {
    return undefined
  }
}

class TerminalSessionImpl implements LiveSession {
  readonly id: string
  private canvas: HTMLCanvasElement | null = null
  private view: InnertaViewHandle | null = null
  private host: HTMLElement | null = null
  /** Versión del attach: un detach STALE (cleanup de un host viejo que corre
   *  después del attach a un host nuevo) no debe matar el RO del host actual. */
  private attachSeq = 0
  private resizeRo: ResizeObserver | null = null
  private inputDispose: (() => void) | null = null
  private unsubTheme: (() => void) | null = null
  private unsubData: (() => void) | null = null
  private unsubExit: (() => void) | null = null
  private ptyId: string
  private started = false
  private starting: Promise<void> | null = null
  private disposed = false

  constructor(id: string) {
    this.id = id
    this.ptyId = `pty-${id}`
  }

  attach(host: HTMLElement): void {
    if (this.disposed) return
    const seq = ++this.attachSeq
    this.host = host
    if (!this.started) {
      void (this.starting ??= this.start())
    }
    // Si el canvas ya existe (sesión ya arrancada antes), re-parentear YA.
    if (this.canvas && this.view) {
      this.mountCanvas(host)
    }
    // El layout puede seguir asentándose tras el remount (flexbox): re-aplicar
    // dims en el próximo frame para que el host del NUEVO panel (sea cual sea)
    // mande el resize correcto al vt/grid/PTY.
    requestAnimationFrame(() => {
      if (seq !== this.attachSeq || this.disposed) return
      this.applyDims()
    })
  }

  private async start(): Promise<void> {
    if (this.disposed) return
    const canvas = document.createElement('canvas')
    canvas.className = 'scrakk-innerta-canvas'
    canvas.tabIndex = 0
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    this.canvas = canvas

    // Adjuntar AL HOST antes de crear la vista: el módulo mide el canvas al
    // init() (clientWidth/clientHeight) y cuelga su ResizeObserver interno del
    // host. Crearlo desmontado dejaba el viewport en el fallback 800×300 → la
    // terminal se renderizaba mini/pixelada (el CSS la estiraba, el engine no).
    if (this.host) this.host.appendChild(canvas)

    // La vista se registra con el id del PTY (`pty-<id>`): view.resize()
    // notifica al main `api.resize({ id })`, y el PTY vive en main bajo
    // `pty-<id>`. Antes la vista usaba el id de sesión ('main') → el resize
    // IPC no encontraba el PTY y el shell (node-pty) NUNCA recibía el nuevo
    // tamaño: el vt se refloweaba pero bash/vim/htop seguían con el viejo.
    const view = await createTerminalView(canvas, this.ptyId)
    if (this.disposed) {
      view.dispose()
      return
    }
    this.view = view
    this.view.focus()

    // El RO interno de la vista observa el host de CREACIÓN; como la sesión
    // se re-parentea entre slots, lo desconectamos y manejamos el resize por
    // host en attach/detach.
    try {
      const internalRo = (view.module as unknown as { _ro?: ResizeObserver })._ro
      internalRo?.disconnect()
    } catch {
      // Vista sin RO interno.
    }

    this.wireInput(canvas)
    void this.applyFont(view)
    this.applyTheme(view)
    this.unsubTheme = listenThemeChanges(() => {
      try {
        if (this.view) applyInnertaTheme(this.view.module)
      } catch {
        // Sesión cerrada.
      }
    })

    const api = getTerminalApi()
    if (!api) {
      view.setContent('$ Innerta Terminal (sin PTY — api no disponible)\r\n')
      this.started = true
      if (this.host) this.mountCanvas(this.host)
      return
    }

    // PTY real con las dims del host actual (si ya hay uno, usar sus dims).
    // cwd = proyecto abierto (si hay); si no, el main cae a HOME.
    const cwd = readWorkspaceRoot()
    const { cols, rows } = this.getRealDims()
    void api.create({ id: this.ptyId, shell: 'bash', cwd, cols, rows })
    view.resize(cols, rows)
    this.unsubData = api.onData((payload) => {
      if (payload.id !== this.ptyId) return
      this.view?.append(payload.data)
    })
    this.unsubExit = api.onExit((payload) => {
      if (payload.id !== this.ptyId) return
      this.view?.append(`\r\n[exit ${payload.exitCode}]\r\n`)
    })

    this.started = true
    if (this.host) this.mountCanvas(this.host)
  }

  private mountCanvas(host: HTMLElement): void {
    if (!this.canvas) return
    if (this.canvas.parentElement !== host) host.appendChild(this.canvas)
    this.canvas.style.display = ''
    this.startResizeObserver(host)
    // Al volver a ser visible, refrescar las dims del PTY/grid (el tamaño
    // pudo cambiar mientras estaba oculta).
    this.applyDims()
  }

  private detachFromHost(): void {
    this.resizeRo?.disconnect()
    this.resizeRo = null
    if (this.canvas && this.host && this.canvas.parentElement === this.host) {
      this.canvas.remove()
    }
    this.host = null
  }

  private startResizeObserver(host: HTMLElement): void {
    this.resizeRo?.disconnect()
    if (typeof ResizeObserver === 'undefined') return
    this.resizeRo = new ResizeObserver(() => this.applyDims())
    this.resizeRo.observe(host)
  }

  private getRealDims(): { cols: number; rows: number } {
    const mod = this.view?.module
    const cw = mod?.getCharWidth?.() ?? 0
    const lh = mod?.getLineHeight?.() ?? 0
    const host = this.liveHost()
    const w = host?.clientWidth ?? 0
    const h = host?.clientHeight ?? 0
    if (cw > 0 && lh > 0 && w > 0 && h > 0) {
      return { cols: Math.floor(w / cw), rows: Math.floor(h / lh) }
    }
    return { cols: 0, rows: 0 }
  }

  /**
   * Host VIVO de la sesión: el host del attach actual si sigue conectado, o
   * el padre real del canvas (la verdad de dónde está montado AHORA, aunque
   * un detach stale haya dejado this.host apuntando a un nodo muerto).
   */
  private liveHost(): HTMLElement | null {
    if (this.host && this.host.isConnected) return this.host
    const parent = this.canvas?.parentElement
    if (parent && parent.isConnected) return parent
    return null
  }

  private applyDims(): void {
    if (!this.view) return
    const host = this.liveHost()
    // Sin host conectado la sesión está pausada (tab inactiva/oculta): no hay
    // nada que resizear; al re-attach se vuelve a llamar applyDims.
    if (!host) return
    // Viewport del RENDER: el engine dibuja al tamaño del host (como el
    // editor vía setBounds). Sin esto el canvas quedaba con el tamaño de
    // init() y el CSS lo estiraba → texto mini. El RO interno de la vista
    // está desconectado (la sesión maneja el resize por host), así que
    // setBounds + resize del grid viven aquí.
    const w = host.clientWidth
    const h = host.clientHeight
    if (w > 0 && h > 0) {
      try {
        this.view.module.setBounds(0, 0, w, h)
      } catch {
        // Vista cerrada.
      }
    }
    const { cols, rows } = this.getRealDims()
    if (cols > 0 && rows > 0) this.view.resize(cols, rows)
  }

  /**
   * Reubica el shell en `root` (cambio de workspace).
   *
   * Se escribe `cd` al PTY en vez de recrearlo: no se pierde el historial ni
   * los procesos de fondo. Si la sesión todavía no arrancó, no hace falta:
   * al crear la PTY va a tomar el root nuevo.
   */
  retarget(root: string): void {
    if (!this.started || this.disposed || !root) return
    const api = getTerminalApi()
    if (!api) return
    // Comilla simple segura (el path puede tener espacios o comillas).
    const quoted = root.replace(/'/g, `'\\''`)
    void api.write({ id: this.ptyId, data: `cd -- '${quoted}'\r` })
  }

  /** Menú contextual propio de la terminal (click derecho sobre su canvas). */
  private openContextMenu(clientX: number, clientY: number): void {
    const api = getTerminalApi()
    const view = this.view
    let hasSelection = false
    try {
      hasSelection = view?.module.terminalHasSelection?.() ?? false
    } catch {
      // Vista cerrada.
    }
    const items: ContextMenuItem[] = [
      {
        label: 'Copiar',
        disabled: !hasSelection,
        onClick: () => {
          try {
            const text = view?.module.terminalGetSelectionText?.() ?? ''
            if (text) void navigator.clipboard?.writeText(text)
            view?.module.terminalClearSelection?.()
          } catch {
            // Vista cerrada.
          }
        }
      },
      {
        label: 'Pegar',
        onClick: () => {
          if (!api) return
          void navigator.clipboard
            ?.readText()
            .then((text) => {
              if (text) void api.write({ id: this.ptyId, data: text })
            })
            .catch(() => {})
        }
      },
      {
        label: 'Limpiar pantalla',
        separatorBefore: true,
        onClick: () => {
          // Limpia el buffer visible del vterm (sin tocar el shell).
          this.view?.setContent('')
        }
      }
    ]
    showContextMenu(clientX, clientY, items)
  }

  private wireInput(canvas: HTMLCanvasElement): void {
    const getModule = (): InnertaModule | null => this.view?.module ?? null

    // Click derecho → menú de la terminal (su propio menú, no el del editor).
    const onContextMenu = (event: MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      this.openContextMenu(event.clientX, event.clientY)
    }
    canvas.addEventListener('contextmenu', onContextMenu)

    // Flush del buffer de salida de vterm (mouse protocol) tras cada evento
    // de pointer/wheel: si el buffer se llena (drag en vim) se pierden eventos.
    const flushVtermOutput = (): void => {
      try {
        const output = this.view?.module.terminalReadOutput?.() ?? ''
        if (output && output.length > 0) {
          getTerminalApi()?.write({ id: this.ptyId, data: output })
        }
      } catch {
        // Vista cerrada / sin export.
      }
    }
    const onFlush = (): void => flushVtermOutput()
    canvas.addEventListener('pointerdown', onFlush)
    canvas.addEventListener('pointermove', onFlush)
    canvas.addEventListener('pointerup', onFlush)
    canvas.addEventListener('wheel', onFlush)

    const input = wireInnertaInput(canvas, getModule, { skipKeyboard: true })
    this.inputDispose = () => {
      input.dispose()
      canvas.removeEventListener('pointerdown', onFlush)
      canvas.removeEventListener('pointermove', onFlush)
      canvas.removeEventListener('pointerup', onFlush)
      canvas.removeEventListener('wheel', onFlush)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }

    // Teclado → PTY (el canvas de terminal no edita: todo va al shell).
    const onKeyDownPty = (e: KeyboardEvent): void => {
      const api = getTerminalApi()
      if (!api) return
      let data: string | null = null
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) data = e.key
      else if (e.key === 'Enter') data = '\r'
      else if (e.key === 'Backspace') data = '\x7f'
      else if (e.key === 'Tab') data = '\t'
      else if (e.key === 'Escape') data = '\x1b'
      else if (e.key === 'ArrowUp') data = '\x1b[A'
      else if (e.key === 'ArrowDown') data = '\x1b[B'
      else if (e.key === 'ArrowRight') data = '\x1b[C'
      else if (e.key === 'ArrowLeft') data = '\x1b[D'
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        e.stopPropagation()
        try {
          const text = this.view?.module.terminalGetSelectionText?.() ?? ''
          if (text) void navigator.clipboard?.writeText(text)
          this.view?.module.terminalClearSelection?.()
        } catch {}
        return
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        e.stopPropagation()
        void navigator.clipboard?.readText().then((text) => {
          if (text) void api.write({ id: this.ptyId, data: text })
        })
        return
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') data = '\x03'
      else if (e.ctrlKey && e.key.toLowerCase() === 'd') data = '\x04'
      else if (e.ctrlKey && e.key.toLowerCase() === 'l') data = '\x0c'
      if (data !== null) {
        e.preventDefault()
        e.stopPropagation()
        void api.write({ id: this.ptyId, data })
      }
    }
    canvas.addEventListener('keydown', onKeyDownPty, true)
    const prevInputDispose = this.inputDispose
    this.inputDispose = () => {
      prevInputDispose?.()
      canvas.removeEventListener('keydown', onKeyDownPty, true)
    }
  }

  private async applyFont(view: InnertaViewHandle): Promise<void> {
    try {
      const fontApi = (
        window as unknown as { api?: { terminal?: { getMonoFont?: () => Promise<{ data: number[] } | null> } } }
      ).api?.terminal?.getMonoFont
      const raw = view.module as unknown as Record<string, unknown>
      const fsApi = (raw as { FS?: { writeFile: (p: string, d: Uint8Array) => void } }).FS
      if (fontApi && fsApi) {
        const result = await fontApi()
        if (this.disposed) return
        if (result?.data?.length) {
          fsApi.writeFile('/fonts/terminal/system-mono.ttf', new Uint8Array(result.data))
          view.module.setTerminalFont('/fonts/terminal/system-mono.ttf')
        } else {
          view.module.setTerminalFont('/fonts/terminal/JetBrainsMono-Regular.ttf')
        }
      } else {
        view.module.setTerminalFont('/fonts/terminal/JetBrainsMono-Regular.ttf')
      }
    } catch {
      // Font por defecto del engine.
    }
    // La fuente cambió las métricas (charWidth/lineHeight): recalcular las
    // dims reales del grid/PTY, que al crear el PTY usaban el fallback.
    this.applyDims()
  }

  private applyTheme(view: InnertaViewHandle): void {
    try {
      applyInnertaTheme(view.module)
    } catch {
      // Tema aún no disponible.
    }
  }

  detach(host?: HTMLElement): void {
    // Detach STALE: el cleanup del host viejo puede correr DESPUÉS del attach
    // a un host nuevo (drag de la tab a otro panel → remount en el mismo
    // commit). Si ya estamos attachados a OTRO host, este detach no debe
    // desconectar el ResizeObserver nuevo ni desmontar el canvas: eso es lo
    // que dejaba la terminal sin resize al NO estar en su panel original.
    if (host && this.host && host !== this.host) return
    this.detachFromHost()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.detachFromHost()
    this.unsubData?.()
    this.unsubExit?.()
    this.unsubTheme?.()
    this.inputDispose?.()
    const api = getTerminalApi()
    if (api) void api.destroy({ id: this.ptyId })
    this.view?.dispose()
    this.view = null
    this.canvas?.remove()
    this.canvas = null
    this.started = false
    sessions.delete(this.id)
  }
}

const sessions = new Map<string, TerminalSessionImpl>()

/** Sesión viva de terminal por id (se crea la primera vez que se pide). */
export function getTerminalSession(id: string): LiveSession {
  let session = sessions.get(id)
  if (!session) {
    session = new TerminalSessionImpl(id)
    sessions.set(id, session)
  }
  return session
}

/** Destruye la sesión (cerrar la tab de la terminal). */
export function destroyTerminalSession(id: string): void {
  sessions.get(id)?.dispose()
}

/** Ids de sesiones de terminal vivas. */
export function listTerminalSessions(): string[] {
  return [...sessions.keys()]
}

/** Reubica TODAS las terminales vivas en `root` (al cambiar de workspace). */
export function retargetTerminalSessions(root: string): void {
  for (const session of sessions.values()) session.retarget(root)
}

// Al cambiar de proyecto, las terminales abiertas se reubican en el nuevo
// root (una terminal nueva ya nace con el root actual, vía readWorkspaceRoot).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('workspace-changed', (event: Event) => {
    const path = (event as CustomEvent<{ path?: string }>).detail?.path
    if (typeof path === 'string' && path.length > 0) retargetTerminalSessions(path)
  })
}

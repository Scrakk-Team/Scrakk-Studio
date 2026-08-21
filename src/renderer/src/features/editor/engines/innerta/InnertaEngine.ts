import type { EditorEngine, EditorEngineId } from '../../engine'
import { getInnertaModule } from './innertaLoader'
import { wireInnertaInput, type InnertaInputHandle } from './innertaInput'
import { applyInnertaTheme, listenThemeChanges } from './innertaTheme'

/** Contrato del engine Innerta (ITE) expuesto al puente del renderer. */
export interface InnertaModule {
  /** Inicializa el engine sobre el canvas del host (ya creado por el puente). */
  init(x: number, y: number, w: number, h: number): void
  shutdown(): void
  frame(): void
  setContent(text: string): void
  /** Abre un archivo: nombre para el chrome (breadcrumb) + contenido. */
  openFile(path: string, content: string): void
  setLanguage?(language: string): void
  setBounds(x: number, y: number, w: number, h: number): void
  setFocus(focused: boolean): void
  setTheme(theme: string): void
   /** Input desde el host (ver innertaInput.ts). */
  mouseMove(x: number, y: number): void
  mouseLeave(): void
  mouseButton(button: number, action: number, mods: number): void
  scroll(x: number, y: number): void
  key(key: number, action: number, mods: number): void
  char(codepoint: number): void
  /** WASM: precarga el clipboard del navegador para que Ctrl+V pegue. */
  setWasmClipboard?(text: string): void
  /** WASM: texto seleccionado actual ("" si no hay selección). */
  getSelectedText?(): string
  /** WASM: contenido completo del buffer (para guardar desde el host). */
  getText?(): string
  /** Theme de Scrakk → colores base del editor. */
  setBgColor(color: number): void
  setAccentColor(color: number): void
  setTextColor(color: number): void
  setBorderColor(color: number): void
  setTextMutedColor(color: number): void
  setIndentGuideColor(color: number): void
  setTokenColor(tokenTypeId: number, color: number): void
}

declare global {
  interface Window {
    __scrakkInnerta?: InnertaModule
  }
}

type PendingRequest = { text?: string; path?: string; content?: string }

/**
 * Puente hacia InnertaEngine compilado a WASM.
 *
 * El engine NO se reescribe: este puente solo envuelve la API C que ya
 * exporta (InitInnerta / SetInnertaBounds / SetInnertaContent / InnertaFrame /
 * SetInnertaFocus / SetInnertaTheme …) expuesta por la glue de emscripten.
 * La carga del artefacto (public/innerta/innerta.js + .wasm) es asíncrona;
 * cualquier petición previa al ready se encola y se aplica al conectarse.
 */
export class InnertaEngine implements EditorEngine {
  readonly id: EditorEngineId = 'InnertaEngine'

  private host: HTMLElement | null = null
  private module: InnertaModule | null = null
  private raf = 0
  private onResize: (() => void) | null = null
  private resizeObserver: ResizeObserver | null = null
  private inputHandle: InnertaInputHandle | null = null
  private unsubscribeTheme: (() => void) | null = null
  private ready = false
  private pending: PendingRequest[] = []

  get statusText(): string | undefined {
    if (this.module) return 'InnertaEngine (ITE · WASM)'
    return 'Cargando InnertaEngine (ITE)…'
  }

  attach(host: HTMLElement): void {
    this.host = host

    const canvas = document.createElement('canvas')
    canvas.className = 'scrakk-innerta-canvas'
    canvas.id = 'scrakk-innerta-surface'
    canvas.tabIndex = 0
    host.appendChild(canvas)

    // Input host → engine (pointer/keyboard/wheel sobre el canvas).
    this.inputHandle = wireInnertaInput(canvas, () => this.module)

    const applyBounds = (): void => {
      if (this.module && this.host) {
        this.module.setBounds(0, 0, this.host.clientWidth, this.host.clientHeight)
      }
    }
    const onResize = (): void => applyBounds()
    this.onResize = onResize
    window.addEventListener('resize', onResize)

    // El host puede cambiar de tamaño sin resize de ventana (split, sidebar,
    // activity bar…): observa el layout real del host.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(onResize)
      this.resizeObserver.observe(host)
    }

    getInnertaModule(canvas)
      .then((module) => {
        if (!this.host) {
          module.shutdown()
          return
        }
        this.module = module
        this.ready = true
        window.__scrakkInnerta = module

        module.init(0, 0, this.host.clientWidth, this.host.clientHeight)
        module.setFocus(true)
        module.setTheme(document.documentElement.dataset.theme ?? 'dark')
        applyBounds()

        // Theme de Scrakk → Innerta (colores base + tokenColors).
        applyInnertaTheme(module)
        this.unsubscribeTheme = listenThemeChanges(() => {
          if (this.module) applyInnertaTheme(this.module)
        })

        const loop = (): void => {
          if (!this.module) return
          this.module.frame()
          this.raf = requestAnimationFrame(loop)
        }
        this.raf = requestAnimationFrame(loop)

        // Flush requests encolados mientras cargaba el módulo.
        const flush = this.pending
        this.pending = []
        for (const req of flush) this.apply(req)
      })
      .catch((err: unknown) => {
        // Sin artefacto: placeholder visual + aviso.
        const msg = document.createElement('div')
        msg.className = 'scrakk-innerta-missing'
        msg.textContent = 'InnertaEngine (ITE): ' + String(err)
        host.appendChild(msg)
      })
  }

  private apply(req: PendingRequest): void {
    if (!this.module) return
    if (req.path !== undefined && req.content !== undefined) {
      this.module.openFile(req.path, req.content)
      applyInnertaTheme(this.module)
    } else if (req.text !== undefined) {
      this.module.setContent(req.text)
    }
  }

  setContent(text: string): void {
    if (this.ready && this.module) {
      this.module.setContent(text)
    } else {
      this.pending.push({ text })
    }
  }

  loadFile(path: string, content: string): void {
    if (this.ready && this.module) {
      this.module.openFile(path, content)
      applyInnertaTheme(this.module)
    } else {
      this.pending.push({ path, content })
    }
    // El canvas gana foco al abrir un archivo: se puede escribir sin un click previo.
    this.host?.querySelector<HTMLCanvasElement>('.scrakk-innerta-canvas')?.focus()
  }

  focus(): void {
    if (this.module) this.module.setFocus(true)
    const canvas = this.host?.querySelector<HTMLCanvasElement>('.scrakk-innerta-canvas')
    canvas?.focus()
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    if (this.module) this.module.shutdown()
    if (this.onResize) window.removeEventListener('resize', this.onResize)
    this.onResize = null
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    if (this.inputHandle) {
      this.inputHandle.dispose()
      this.inputHandle = null
    }
    if (this.unsubscribeTheme) {
      this.unsubscribeTheme()
      this.unsubscribeTheme = null
    }
    this.host
      ?.querySelectorAll('.scrakk-innerta-canvas, .scrakk-innerta-missing')
      .forEach((n) => n.remove())
    this.host = null
    this.module = null
    this.ready = false
    this.pending = []
  }
}
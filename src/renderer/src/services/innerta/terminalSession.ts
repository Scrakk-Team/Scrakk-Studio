// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
import { OscTitleParser } from './oscTitle'

import { t } from '@core/i18n'
/** API del terminal expuesta por el preload (api.terminal). */
interface TerminalApi {
  create: (req: { id: string; shell?: string; cwd?: string; cols: number; rows: number }) => Promise<unknown>
  write: (req: { id: string; data: string }) => Promise<void>
  cd: (req: { id: string; path: string }) => Promise<void>
  resize: (req: { id: string; cols: number; rows: number }) => Promise<void>
  destroy: (req: { id: string }) => Promise<void>
  onData: (cb: (payload: { id: string; data: string }) => void) => () => void
  onExit: (cb: (payload: { id: string; exitCode: number }) => void) => () => void
  /**
   * Cadena de fuentes de la terminal (primaria + reemplazos), resuelta por el
   * main desde el SISTEMA. `null` si no se pudo resolver ninguna.
   */
  getFontStack?: (req?: { family?: string }) => Promise<
    Array<{ family: string; file: string; data: Uint8Array }> | null
  >
  /** Legado: una sola monospace del sistema. */
  getMonoFont?: () => Promise<{ data: number[] } | null>
  /** Familias monoespaciadas instaladas (selector de Ajustes). */
  listMonoFonts?: () => Promise<string[]>
  /** Fuente CJK del sistema, pedida sólo cuando el buffer tiene CJK. */
  getCjkFont?: (req?: { family?: string }) => Promise<{
    family: string
    file: string
    data: Uint8Array
  } | null>
  /** Fuente de EMOJI a color del sistema (sólo para code points emoji). */
  getEmojiFont?: () => Promise<{
    family: string
    file: string
    data: Uint8Array
  } | null>
  /** Fuente y TAMAÑO de la terminal por defecto del sistema. */
  getSystemFont?: () => Promise<{ family: string; px: number } | null>
}

/**
 * Emoji de presentación EMOJI (los que van a COLOR).
 *
 * Es la misma propiedad Unicode que usa el motor: `✓ ❤ ☀ ⚠` NO están (van
 * monocromos, como los pidió el CLI) y `⚡ ✅ ✨ 😀` sí. Sin el flag `g`, así
 * `.test` no queda con estado.
 */
const EMOJI_PRESENTATION_RE = /\p{Emoji_Presentation}/u

/**
 * Caracteres que disparan la carga de la fuente CJK.
 *
 * Cubre los bloques que una terminal usa de verdad: kana, CJK unificado (y su
 * extensión A), ideogramas de compatibilidad, hangul y las formas de ancho
 * completo. Sin el flag `g`, así `.test` no queda con estado.
 */
const CJK_RE = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/

/**
 * Familia elegida en Ajustes para la terminal.
 *
 * Vacío = la monoespaciada por defecto del sistema (lo que resuelve el main).
 * Solo se guarda la ELECCIÓN; la fuente en sí se resuelve en caliente.
 */
export const TERMINAL_FONT_SETTING_KEY = 'scrakk-terminal-font'

/** Familia elegida ('' = la del sistema). */
export function getTerminalFontFamily(): string {
  try {
    return localStorage.getItem(TERMINAL_FONT_SETTING_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Guarda la familia elegida y la re-aplica en TODAS las terminales vivas.
 *
 * La fuente se vuelve a resolver desde el sistema (nada se cachea), así que la
 * terminal abierta cambia al instante sin reabrir la pestaña.
 */
export function setTerminalFontFamilyEverywhere(family: string): void {
  try {
    localStorage.setItem(TERMINAL_FONT_SETTING_KEY, family)
  } catch {
    // Sin storage: solo aplica en runtime.
  }
  for (const session of sessions.values()) session.reloadFont()
}

/** Familias monoespaciadas instaladas (para el selector). */
export async function listMonoFontFamilies(): Promise<string[]> {
  const api = getTerminalApi()
  if (!api?.listMonoFonts) return []
  try {
    return await api.listMonoFonts()
  } catch {
    return []
  }
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

/**
 * Tecla → bytes de terminal, como cualquier emulador.
 *
 * ⚠ NO VOLVER A UNA LISTA BLANCA. Antes esto era: "letras sueltas, Enter, Tab,
 * Escape, flechas y Ctrl+C/D/L" y el resto se DESCARTABA. Resultado: Ctrl+B
 * (tmux), Ctrl+K, Ctrl+U, Alt+cualquier cosa, F1-F12, Shift+Tab, PageUp/Down…
 * no llegaban NUNCA al programa. Ese era el bug de "los shortcuts del CLI no
 * funcionan".
 *
 * `null` = no mandar nada (teclas del sistema, Super, composición IME).
 */
function encodeKey(e: KeyboardEvent): string | null {
  const shift = e.shiftKey
  const alt = e.altKey
  const ctrl = e.ctrlKey
  // Super/Cmd no es una tecla de terminal: deja pasar los atajos del host.
  if (e.metaKey || e.isComposing) return null
  // xterm: modificador = 1 + shift + 2*alt + 4*ctrl.
  const mod = 1 + (shift ? 1 : 0) + (alt ? 2 : 0) + (ctrl ? 4 : 0)

  const arrows: Record<string, string> = {
    ArrowUp: 'A',
    ArrowDown: 'B',
    ArrowRight: 'C',
    ArrowLeft: 'D'
  }
  if (arrows[e.key]) {
    return mod === 1 ? `\x1b[${arrows[e.key]}` : `\x1b[1;${mod}${arrows[e.key]}`
  }
  if (e.key === 'Home' || e.key === 'End') {
    const f = e.key === 'Home' ? 'H' : 'F'
    return mod === 1 ? `\x1b[${f}` : `\x1b[1;${mod}${f}`
  }
  const tilde: Record<string, number> = {
    Insert: 2,
    Delete: 3,
    PageUp: 5,
    PageDown: 6,
    F5: 15,
    F6: 17,
    F7: 18,
    F8: 19,
    F9: 20,
    F10: 21,
    F11: 23,
    F12: 24
  }
  if (tilde[e.key] !== undefined) {
    return mod === 1 ? `\x1b[${tilde[e.key]}~` : `\x1b[${tilde[e.key]};${mod}~`
  }
  const ss3: Record<string, string> = { F1: 'P', F2: 'Q', F3: 'R', F4: 'S' }
  if (ss3[e.key]) {
    return mod === 1 ? `\x1bO${ss3[e.key]}` : `\x1b[1;${mod}${ss3[e.key]}`
  }
  if (e.key === 'Enter') return alt ? '\x1b\r' : '\r'
  // Shift+Tab es su PROPIA secuencia: los TUIs la usan muchísimo para navegar.
  if (e.key === 'Tab') return shift ? '\x1b[Z' : alt ? '\x1b\t' : '\t'
  if (e.key === 'Backspace') return alt ? '\x1b\x7f' : '\x7f'
  if (e.key === 'Escape') return alt ? '\x1b\x1b' : '\x1b'
  if (e.key.length !== 1) return null

  // Ctrl+tecla → código de control (Ctrl+A = 0x01 … Ctrl+Z = 0x1A).
  let data = e.key
  if (ctrl) {
    const up = e.key.toUpperCase()
    if (up >= 'A' && up <= 'Z') data = String.fromCharCode(up.charCodeAt(0) - 64)
    else if (e.key === '[') data = '\x1b'
    else if (e.key === '\\') data = '\x1c'
    else if (e.key === ']') data = '\x1d'
    else if (e.key === '^') data = '\x1e'
    else if (e.key === '_' || e.key === '/') data = '\x1f'
    else if (e.key === ' ' || e.key === '@') data = '\x00'
    else if (e.key === '?') data = '\x7f'
    else return null
  }
  // Alt = prefijo ESC (el "meta" de toda la vida).
  return alt ? `\x1b${data}` : data
}

class TerminalSessionImpl implements LiveSession {
  readonly id: string
  private canvas: HTMLCanvasElement | null = null
  private view: InnertaViewHandle | null = null
  private host: HTMLElement | null = null
  /** Versión del attach: un detach STALE (cleanup de un host viejo que corre
   *  después del attach a un host nuevo) no debe matar el RO del host actual. */
  private attachSeq = 0
  /**
   * Escala de RENDER del canvas (1 = nativo). La pide el visor de nodos: el
   * zoom del mundo es CSS y estira el bitmap, así que acá se le da al motor la
   * resolución que va a ocupar en pantalla (ver `setRenderScale`).
   */
  private renderScale = 1
  /** Título que reporta la terminal por OSC (0/2). Vacío si nunca lo hizo. */
  private title = ''
  private readonly oscTitle = new OscTitleParser()
  private readonly titleListeners = new Set<(title: string) => void>()
  /** Tamaño de fuente del motor a escala 1 (el que NO depende del zoom). */
  private baseFontSize = 0
  /**
   * Cadena COMPLETA de la terminal: primaria + reemplazos, EN ORDEN.
   *
   * Es la que resuelve el main desde el sistema (fontconfig en Linux). Los
   * archivos viven en el FS del WASM (en memoria): no se guardan en disco.
   */
  private fontPaths: string[] = []
  /**
   * Fuente CJK cargada BAJO DEMANDA (o null). Pesa decenas de MB, así que sólo
   * entra si en el buffer apareció CJK; ver `maybeLoadCjk`.
   */
  private cjkPath: string | null = null
  /** Ya se pidió la CJK (no se reintenta, aunque no haya). */
  private cjkRequested = false
  /** Fuente de EMOJI a color cargada (o null). Aparte de la cadena. */
  private emojiPath: string | null = null
  /** Ya se pidió la fuente de emoji (no se reintenta). */
  private emojiRequested = false
  /**
   * Fuente y tamaño de la TERMINAL DEL SISTEMA (los suyos, no los del editor).
   * Sin esto la celda quedaba más grande y los TUIs no cuadraban.
   */
  private systemFontFamily = ''
  /** Escala con la que ya se re-aplicó `fontPaths` (evita recargar de más). */
  private fontScaleApplied = 1
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

    // Fuente y TAMAÑO de la terminal DEL SISTEMA, ANTES de la cadena: el atlas
    // se construye con las mismas métricas de celda que su terminal.
    await this.applySystemFont(view)
    if (this.disposed) return

    this.wireInput(canvas)
    void this.applyFont(view)
    this.applyTheme(view)
    // Tamaño de fuente del motor a escala 1: el zoom del visor lo multiplica
    // (ver `setRenderScale`). Si el build no expone el getter queda 0 y el
    // escalado se saltea solo, sin romper nada.
    this.baseFontSize = view.module.getFontSize?.() ?? 0
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
    void api.create({ id: this.ptyId, cwd, cols, rows })
    view.resize(cols, rows)
    this.unsubData = api.onData((payload) => {
      if (payload.id !== this.ptyId) return
      this.view?.append(payload.data)
      this.maybeLoadCjk(payload.data)
      this.maybeLoadEmoji(payload.data)
      // El título lo reporta la propia terminal (OSC 0/2): se parsea acá porque
      // el host ve los bytes crudos del PTY.
      const title = this.oscTitle.push(payload.data)
      if (title !== null) this.setTitle(title)
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
    // Con escala, el ancho Y el ancho de carácter crecen por igual: `cols`
    // queda EXACTAMENTE igual que sin zoom — por eso el PTY no se reflowea.
    const w = (host?.clientWidth ?? 0) * this.renderScale
    const h = (host?.clientHeight ?? 0) * this.renderScale
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
      // La ESCALA del visor de nodos entra acá: más píxeles de buffer Y la
      // fuente multiplicada por el mismo factor. El motor re-rasteriza la
      // fuente, así que el zoom del lienzo queda nítido en vez de estirar el
      // bitmap ya dibujado.
      const px = Math.round(w * this.renderScale)
      const py = Math.round(h * this.renderScale)
      if (this.canvas) {
        this.canvas.width = px
        this.canvas.height = py
      }
      try {
        this.view.module.setBounds(0, 0, px, py)
        // El zoom cambia el tamaño de fuente… pero `SetTheme` recarga la fuente
        // del EDITOR (`ReloadFont`), que en un view de terminal PISA la
        // monoespaciada y deja las celdas más anchas que los glifos → letras
        // separadas. Por eso, cambiado el tamaño, se vuelve a aplicar la fuente
        // de la TERMINAL: eso recarga el atlas a `fontSize - 1` y recalcula las
        // métricas, así el par celda/glifo queda como a escala 1.
        if (this.baseFontSize > 0 && this.fontPaths.length > 0 && this.renderScale !== this.fontScaleApplied) {
          this.view.module.setFontSize?.(this.baseFontSize * this.renderScale)
          this.applyFontPaths()
          this.fontScaleApplied = this.renderScale
        }
      } catch {
        // Vista cerrada.
      }
    }
    const { cols, rows } = this.getRealDims()
    if (cols > 0 && rows > 0) this.view.resize(cols, rows)
  }

  /** Ver `LiveSession.getTitle`. */
  getTitle(): string {
    return this.title
  }

  /** Ver `LiveSession.onTitleChange`. */
  onTitleChange(cb: (title: string) => void): () => void {
    this.titleListeners.add(cb)
    return () => {
      this.titleListeners.delete(cb)
    }
  }

  private setTitle(title: string): void {
    this.title = title
    for (const cb of [...this.titleListeners]) {
      try {
        cb(title)
      } catch {
        // Un suscriptor roto no tumba a los demás.
      }
    }
  }

  /** Ver `LiveSession.setRenderScale`. */
  setRenderScale(scale: number): void {
    // Sólo hacia ARRIBA: por debajo de 1 el navegador ya reduce un raster más
    // grande, y no hace falta gastar buffer. El techo es el del zoom del visor.
    const next = Math.min(2, Math.max(1, scale))
    if (Math.abs(next - this.renderScale) < 0.02) return
    this.renderScale = next
    this.applyDims()
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
    // El `cd` lo arma el main según la shell (POSIX vs cmd.exe): acá sólo se
    // pide reubicar. No se recrea el PTY, así no se pierde el historial.
    void api.cd({ id: this.ptyId, path: root })
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
        get label() { return t('services.copiar') },
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
        get label() { return t('services.pegar') },
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
        get label() { return t('services.limpiar.pantalla') },
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

    // Teclado → PTY. Todo va al shell: lo resuelve `encodeKey`.
    const onKeyDownPty = (e: KeyboardEvent): void => {
      const api = getTerminalApi()
      if (!api) return
      // Reservados del host: copiar/pegar con Ctrl+Shift+C/V, como cualquier
      // terminal. TODO lo demás (Ctrl+<letra>, Alt, F-keys…) es del CLI.
      if (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        e.stopPropagation()
        try {
          const text = this.view?.module.terminalGetSelectionText?.() ?? ''
          if (text) void navigator.clipboard?.writeText(text)
          this.view?.module.terminalClearSelection?.()
        } catch {
          // Sin selección o sin clipboard.
        }
        return
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        e.stopPropagation()
        void navigator.clipboard?.readText().then((text) => {
          if (text) void api.write({ id: this.ptyId, data: text })
        })
        return
      }
      const data = encodeKey(e)
      if (data === null) return
      e.preventDefault()
      e.stopPropagation()
      void api.write({ id: this.ptyId, data })
    }
    canvas.addEventListener('keydown', onKeyDownPty, true)
    const prevInputDispose = this.inputDispose
    this.inputDispose = () => {
      prevInputDispose?.()
      canvas.removeEventListener('keydown', onKeyDownPty, true)
    }
  }

  /**
   * Carga la CADENA de fuentes de la terminal.
   *
   * El main la resuelve desde el sistema (fontconfig en Linux) y acá se escriben
   * los archivos en el FS del motor y se le pasa la lista: primaria + reemplazos,
   * EN ORDEN. Es lo que hace que un `─`, un `⠋` o una flecha salgan de la MISMA
   * fuente que en la terminal del usuario, en vez de las empaquetadas.
   *
   * Los archivos viven en el FS del WASM (memoria): no se escriben en disco, así
   * que al cerrar desaparecen y al abrir se vuelven a resolver.
   */
  private async applyFont(view: InnertaViewHandle): Promise<void> {
    try {
      const api = (window as unknown as { api?: { terminal?: TerminalApi } }).api?.terminal
      const raw = view.module as unknown as Record<string, unknown>
      const fsApi = (raw as { FS?: { writeFile: (p: string, d: Uint8Array) => void } }).FS

      const family = this.effectiveFamily()
      const stack =
        api?.getFontStack && fsApi
          ? await api.getFontStack(family ? { family } : undefined)
          : null
      if (this.disposed) return

      if (stack?.length && view.module.setTerminalFonts) {
        const paths: string[] = []
        stack.forEach((font, index) => {
          const path = `/fonts/terminal/stack-${index}.ttf`
          fsApi!.writeFile(path, font.data)
          paths.push(path)
        })
        this.fontPaths = this.withCjk(paths)
        this.applyFontPaths()
        this.applyDims()
        return
      }

      // Sin cadena (o motor sin el export): la mono de siempre, o la embebida.
      const single = api?.getMonoFont && fsApi ? await api.getMonoFont() : null
      if (this.disposed) return
      if (single?.data?.length && fsApi) {
        const path = '/fonts/terminal/system-mono.ttf'
        fsApi.writeFile(path, new Uint8Array(single.data))
        this.fontPaths = this.withCjk([path])
      } else {
        this.fontPaths = this.withCjk(['/fonts/terminal/JetBrainsMono-Regular.ttf'])
      }
      this.applyFontPaths()
    } catch {
      // Font por defecto del engine.
    }
    // La fuente cambió las métricas (charWidth/lineHeight): recalcular las
    // dims reales del grid/PTY, que al crear el PTY usaban el fallback.
    this.applyDims()
  }

  /** Familia efectiva: la elegida en Ajustes o la de la terminal del sistema. */
  private effectiveFamily(): string {
    return getTerminalFontFamily() || this.systemFontFamily
  }

  /**
   * Fuente y TAMAÑO de la terminal del sistema.
   *
   * El tamaño importa tanto como la familia: el ancho y el ALTO de celda salen
   * de la fuente a ese tamaño, y si no coincide, los TUIs (que mezclan `─` con
   * `│`) no cuadran.
   */
  private async applySystemFont(view: InnertaViewHandle): Promise<void> {
    const api = getTerminalApi()
    let info: { family: string; px: number } | null = null
    if (api?.getSystemFont) {
      try {
        info = await api.getSystemFont()
      } catch {
        info = null
      }
    }
    if (this.disposed) return
    if (info && info.px > 0) {
      this.systemFontFamily = info.family
      // `setFontSize` (zoom) fija `theme.fontSize`; la cadena de la terminal se
      // aplica después y toma ese tamaño.
      view.module.setFontSize?.(info.px)
      return
    }
    // Sin datos del sistema (o un `main` que todavía no expone el canal): el
    // viejo "1px menos que el editor", así no queda más grande que antes.
    const base = view.module.getFontSize?.() ?? 0
    if (base > 1) view.module.setFontSize?.(base - 1)
  }

  /** La cadena vigente + la CJK ya cargada (si la hay), sin repetir. */
  private withCjk(paths: readonly string[]): string[] {
    if (this.cjkPath && !paths.includes(this.cjkPath)) return [...paths, this.cjkPath]
    return [...paths]
  }

  /**
   * CJK BAJO DEMANDA: si en lo que llega del PTY aparece un carácter CJK, se trae
   * la fuente CJK del sistema y se agrega al final de la cadena.
   *
   * No entra por defecto porque pesa decenas de MB y cada terminal carga su copia;
   * así sólo se paga en las sesiones que de verdad muestran CJK.
   */
  private maybeLoadCjk(data: string): void {
    if (this.cjkPath || this.cjkRequested || this.disposed) return
    if (!CJK_RE.test(data)) return
    this.cjkRequested = true
    void this.loadCjk()
  }

  /**
   * EMOJI bajo demanda: cuando en el PTY aparece un emoji de presentación emoji,
   * se trae la fuente de COLOR del sistema y se la da al motor en su ranura
   * propia. Así `⚡ ✅ ✨ 😀` salen a color y `✓ ❤ ☀ ⚠` siguen MONOCROMOS por la
   * cadena, como los ve el CLI en su terminal.
   *
   * El motor tira los glifos emoji ya cacheados al recibirla, así que el primer
   * frame se corrige solo (ver `SetEmojiFontPath`).
   */
  private maybeLoadEmoji(data: string): void {
    if (this.emojiPath || this.emojiRequested || this.disposed) return
    if (!EMOJI_PRESENTATION_RE.test(data)) return
    this.emojiRequested = true
    void this.loadEmoji()
  }

  private async loadEmoji(): Promise<void> {
    const view = this.view
    const api = getTerminalApi()
    const fsApi = (
      view?.module as unknown as { FS?: { writeFile: (p: string, d: Uint8Array) => void } }
    )?.FS
    if (!view || !api?.getEmojiFont || !fsApi) return
    try {
      const font = await api.getEmojiFont()
      if (this.disposed || !font?.data?.length) return
      const path = '/fonts/terminal/emoji.ttf'
      fsApi.writeFile(path, font.data)
      this.emojiPath = path
      // No toca la cadena: es una cara aparte, sólo para presentación emoji.
      view.module.setTerminalEmojiFont?.(path)
    } catch {
      // Sin emoji a color: se queda con la cadena (monocromo), como una terminal
      // sin fuente de emoji instalada.
    }
  }

  private async loadCjk(): Promise<void> {
    const view = this.view
    const api = getTerminalApi()
    const fsApi = (
      view?.module as unknown as { FS?: { writeFile: (p: string, d: Uint8Array) => void } }
    )?.FS
    if (!view || !api?.getCjkFont || !fsApi) return
    try {
      const family = this.effectiveFamily()
      const font = await api.getCjkFont(family ? { family } : undefined)
      if (this.disposed || !font?.data?.length) return
      const path = '/fonts/terminal/cjk-0.ttf'
      fsApi.writeFile(path, font.data)
      this.cjkPath = path
      this.fontPaths = this.withCjk(this.fontPaths)
      this.applyFontPaths()
      // La fuente nueva cambia las métricas del fallback: recalcular el grid/PTY.
      this.applyDims()
    } catch {
      // Sin CJK: se queda con lo que haya (y no se reintenta).
    }
  }

  /**
   * Aplica la cadena vigente al motor.
   *
   * Se usa al cargar la fuente y también al cambiar el ZOOM (ver `applyDims`): el
   * tamaño de fuente pasa por `SetTheme`, que recarga la del EDITOR y PISA la
   * monoespaciada — por eso hay que volver a aplicar la cadena.
   */
  private applyFontPaths(): void {
    const mod = this.view?.module
    if (!mod || this.fontPaths.length === 0) return
    if (typeof mod.setTerminalFonts === 'function') {
      mod.setTerminalFonts(this.fontPaths.join('\n'))
      return
    }
    mod.setTerminalFont(this.fontPaths[0])
  }

  /** Re-resuelve la cadena desde el sistema (cambió la familia en Ajustes). */
  reloadFont(): void {
    const view = this.view
    if (!view || this.disposed) return
    void this.applyFont(view)
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
    this.titleListeners.clear()
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

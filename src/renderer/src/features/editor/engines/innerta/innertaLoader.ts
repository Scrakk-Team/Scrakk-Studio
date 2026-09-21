import type { InnertaModule } from './InnertaEngine'
import { detectLanguageFromPath } from '../../languages'

declare global {
  interface Window {
    createInnertaModule?: (config?: Record<string, unknown>) => Promise<unknown>
  }
}

/** Módulo crudo de emscripten — EM_JS llama aquí (Module._innertaOn*). */
let rawModule: Record<string, unknown> | null = null

export function getInnertaRawModule(): Record<string, unknown> | null {
  return rawModule
}

let pending: Promise<InnertaModule> | null = null
/**
 * Promesa ÚNICA de carga del script. Antes esto era un boolean: si el editor
 * y la terminal pedían la glue casi a la vez (arranque del IDE con la
 * terminal restaurada), el segundo llamador veía `scriptInjected=true` y
 * resolvía ANTES de que el script terminara de cargar → createInnertaModule
 * indefinido → la terminal se quedaba negra hasta reabrirla (o arrancaba
 * aleatorio según el timing). Con la promesa compartida los dos esperan el
 * mismo onload.
 */
let scriptPromise: Promise<void> | null = null
/** Canvas del host activo: se retargetea en init() (ver wrap). */
let currentCanvas: HTMLCanvasElement | null = null

function injectScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      // Relativo al documento: en dev es /innerta/... vía el dev server y en
      // prod (loadFile → file://) resuelve dentro del asar. La ruta absoluta
      // '/innerta/...' SOLO servía en dev: en file:// apuntaba a la raíz del
      // disco y la glue nunca cargaba (el editor quedaba sin Innerta).
      s.src = getInnertaBaseUrl() + 'innerta.js'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        scriptPromise = null
        reject(new Error('No se pudo cargar innerta/innerta.js'))
      }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

/**
 * Base de los assets Innerta (glue + wasm), relativa al documento actual.
 * Funciona idéntico en dev (http://localhost) y prod (file://…/out/renderer/).
 */
export function getInnertaBaseUrl(): string {
  return new URL('innerta/', document.baseURI).href
}

/** Config común para toda creación de módulo: resuelve innerta.wasm junto a la glue. */
function innertaModuleConfig(canvas: HTMLCanvasElement): Record<string, unknown> {
  const base = getInnertaBaseUrl()
  return {
    canvas,
    // Emscripten resuelve el .wasm vía locateFile: en file:// hay que fijarla
    // explícita o la glue intenta fetch de rutas relativas rotas.
    locateFile: (file: string): string => base + file,
    // Alpha straight para glassmorphism: el engine ya limpia con el
    // alpha del tema (setBgColor) y mezcla straight-alpha. Declararlo
    // evita que la glue cree un contexto opaco por default.
    webglContextAttributes: { alpha: true, premultipliedAlpha: false }
  }
}

// ── Guard de foco host-side para el teclado del puerto GLFW ────────────────
// El puerto GLFW de emscripten registra keydown/keypress/keyup en `window`
// con capture y — según la versión de la glue — hace preventDefault de
// Backspace/Tab y reenvía chars al WASM sin mirar el foco DOM: el foco
// "nunca sale" del editor/terminal y borrar texto se rompe en todo el IDE.
//
// Este guard envuelve `window.addEventListener` SOLO mientras corre la
// creación del módulo: los listeners de teclado en fase captura que registre
// la glue quedan envueltos con `event.target === canvas-del-módulo`. Así el
// fix sobrevive a recompilaciones de innerta.js (el fix no vive en la glue).
// Los listeners de la app (shortcuts, modales) no se tocan.

type AddEventListenerFn = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) => void

const GLFW_KEY_EVENT_TYPES = new Set(['keydown', 'keypress', 'keyup'])
let guardedLoads = 0
let originalAdd: AddEventListenerFn | null = null

const guardedAdd: AddEventListenerFn = (type, listener, options) => {
  // La glue registra SIEMPRE key* en capture=true; lo demás pasa igual.
  const isCapture = options === true || (typeof options === 'object' && options?.capture === true)
  if (originalAdd && (!GLFW_KEY_EVENT_TYPES.has(type) || !isCapture)) {
    originalAdd(type, listener, options)
    return
  }
  if (!originalAdd) return
  const guarded = (event: Event): void => {
    // Solo eventos dirigidos al canvas del módulo (foco DOM real en él).
    if (event.target !== getGuardedCanvas()) return
    if (typeof listener === 'function') listener(event)
    else listener.handleEvent(event)
  }
  originalAdd(type, guarded, options)
}

/** Canvas del módulo que se está cargando (se setea por carga en curso). */
let getGuardedCanvas: () => HTMLCanvasElement | null = () => null

/** Entra al guard: desde aquí TODO listener key* con capture que se registre
 *  en `window` queda envuelto (solo corre si el evento va al canvas dado).
 *  Devuelve el getter previo para restaurarlo al salir. */
function enterKeyboardGuard(getCanvas: () => HTMLCanvasElement | null): () => HTMLCanvasElement | null {
  const wasGetter = getGuardedCanvas
  getGuardedCanvas = getCanvas
  if (guardedLoads === 0) {
    const target = window as unknown as { addEventListener: AddEventListenerFn }
    originalAdd = target.addEventListener
    target.addEventListener = guardedAdd
  }
  guardedLoads++
  return wasGetter
}

function exitKeyboardGuard(wasGetter: () => HTMLCanvasElement | null): void {
  guardedLoads--
  if (guardedLoads === 0) {
    const target = window as unknown as { addEventListener: AddEventListenerFn }
    if (originalAdd) target.addEventListener = originalAdd
    originalAdd = null
  }
  getGuardedCanvas = wasGetter
}

function withGuardedKeyboardListeners<T>(
  getCanvas: () => HTMLCanvasElement | null,
  run: () => Promise<T>
): Promise<T> {
  const wasGetter = enterKeyboardGuard(getCanvas)
  return run().finally(() => exitKeyboardGuard(wasGetter))
}

/**
 * Versión SYNC del guard, para `init()`.
 *
 * El puerto GLFW de emscripten registra sus handlers de teclado en `window`
 * (capture) la PRIMERA vez que el engine inicializa — `glfwInit` corre dentro
 * de `_InitInnerta`, no al crear el módulo. Sin guard, ese `onKeydown` hace
 * `preventDefault()` de Backspace y Tab SIEMPRE, sin mirar el foco DOM: el
 * usuario puede tipear en cualquier input de la app pero no borrar. Como
 * `init()` es síncrono, envolverlo solo alcanza listeners registrados por el
 * propio init (el stack no puede traer listeners de la app).
 */
export function withKeyboardListenerGuard<T>(
  getCanvas: () => HTMLCanvasElement | null,
  run: () => T
): T {
  const wasGetter = enterKeyboardGuard(getCanvas)
  try {
    return run()
  } finally {
    exitKeyboardGuard(wasGetter)
  }
}

function toUtf32Ptr(raw: Record<string, unknown>, text: string): number {
  const { _malloc, stringToUTF32 } = raw as Record<string, (...a: never[]) => unknown>
  const bytes = (text.length + 1) * 4
  const ptr = (_malloc as (s: number) => number)(bytes)
  ;(stringToUTF32 as (s: string, p: number, n: number) => void)(text, ptr, bytes)
  return ptr
}

/** UTF-8 para exports `const char*` (clipboard del engine). */
function toUtf8Ptr(raw: Record<string, unknown>, text: string): number {
  const { _malloc, stringToUTF8, lengthBytesUTF8 } = raw as Record<
    string,
    (...a: never[]) => unknown
  >
  const bytes = (lengthBytesUTF8 as (s: string) => number)(text) + 1
  const ptr = (_malloc as (s: number) => number)(bytes)
  ;(stringToUTF8 as (s: string, p: number, n: number) => void)(text, ptr, bytes)
  return ptr
}

function wrap(raw: Record<string, unknown>): InnertaModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _raw = raw as Record<string, any>
  let inited = false
  return {
    init(x: number, y: number, w: number, h: number) {
      // El puerto GLFW de emscripten lee Module['canvas'] durante InitInnerta.
      // Se asigna aquí (no al crear el módulo): así el canvas es el del host
      // activo aunque el panel se haya remontado (p. ej. StrictMode en dev).
      if (currentCanvas) _raw.canvas = currentCanvas
      // Guard: glfwInit corre aquí y registra sus key handlers globales.
      withKeyboardListenerGuard(() => currentCanvas, () => {
        _raw._InitInnerta(0, x, y, w, h)
        _raw._SetInnertaVisible(1)
        _raw._SetInnertaBounds(x, y, w, h)
      })
      inited = true
    },
    shutdown() {
      if (!inited) return
      _raw._ShutdownInnerta()
    },
    frame() {
      _raw._InnertaFrame()
    },
    setContent(text) {
      const ptr = toUtf32Ptr(_raw, text)
      _raw._SetInnertaContent(ptr)
      _raw._free(ptr)
      if (typeof _raw._InnertaEnsureVisible === 'function') {
        _raw._InnertaEnsureVisible()
      }
    },
    openFile(path, content) {
      // 1. Abrir el archivo en Innerta (establece sesión/buffer para esta ruta)
      const pathPtr = toUtf32Ptr(_raw, path)
      _raw._OpenInnertaFile(pathPtr)
      _raw._free(pathPtr)

      // 2. Cargar el contenido en el buffer
      if (content.length > 0) {
        const cPtr = toUtf32Ptr(_raw, content)
        _raw._SetInnertaContent(cPtr)
        _raw._free(cPtr)
      }

      // 3. Forzar el lenguaje explícito para que Tree-sitter procese el buffer poblado
      const lang = detectLanguageFromPath(path)
      if (lang && typeof _raw._SetInnertaLanguage === 'function') {
        const langPtr = toUtf32Ptr(_raw, lang)
        _raw._SetInnertaLanguage(langPtr)
        _raw._free(langPtr)
      }

      if (typeof _raw._SetInnertaBreadcumbFilename === 'function') {
        const filename = path.split(/[/\\]/).pop() ?? path
        const namePtr = toUtf32Ptr(_raw, filename)
        _raw._SetInnertaBreadcumbFilename(namePtr)
        _raw._free(namePtr)
      }

      if (typeof _raw._InnertaEnsureVisible === 'function') {
        _raw._InnertaEnsureVisible()
      }
    },
    setLanguage(language) {
      if (typeof _raw._SetInnertaLanguage === 'function') {
        const ptr = toUtf32Ptr(_raw, language)
        _raw._SetInnertaLanguage(ptr)
        _raw._free(ptr)
      }
    },
    setBounds(x, y, w, h) {
      _raw._SetInnertaBounds(x, y, w, h)
    },
    setFocus(focused) {
      _raw._SetInnertaFocus(focused ? 1 : 0)
    },
    setTheme(theme) {
      const ptr = toUtf32Ptr(_raw, theme)
      _raw._SetInnertaTheme(ptr)
      _raw._free(ptr)
    },
    setMinimapVisible(visible: boolean) {
      if (typeof _raw._SetInnertaMinimapVisible !== 'function') return
      ;(_raw._SetInnertaMinimapVisible as (v: number) => void)(visible ? 1 : 0)
    },
    mouseMove(x, y) {
      _raw._InnertaMouseMove(x, y)
    },
    mouseLeave() {
      _raw._InnertaMouseLeave()
    },
    mouseButton(button, action, mods) {
      _raw._InnertaMouseButton(button, action, mods)
    },
    scroll(x, y) {
      _raw._InnertaScroll(x, y)
    },
    key(key, action, mods) {
      _raw._InnertaKey(key, action, mods)
    },
    char(codepoint) {
      _raw._InnertaChar(codepoint)
    },
    hitTest(x, y) {
      if (typeof _raw._InnertaHitTest !== 'function') return { line: -1, col: -1 }
      const packed = _raw._InnertaHitTest(x, y) as number
      if (packed < 0) return { line: -1, col: -1 }
      return { line: packed >> 16, col: packed & 0xffff }
    },
    /** X donde arranca el texto (ancho del gutter); `null` si el WASM no lo trae. */
    getTextXOffset() {
      const fn = (_raw as Record<string, unknown>)['_GetInnertaTextXOffset']
      if (typeof fn !== 'function') return null
      try {
        const value = (fn as () => number)()
        return typeof value === 'number' && value >= 0 ? value : null
      } catch {
        return null
      }
    },
    /**
     * Posición del cursor. Opcional: si el WASM no exporta
     * `_GetInnertaCursor`, retorna `null` (la UI muestra "Ln —, Col —").
     * Cuando el otro repo sume el export, este wiring ya está listo.
     */
    getCursor() {
      const fn = (_raw as Record<string, unknown>)['_GetInnertaCursor']
      if (typeof fn !== 'function') return null
      try {
        const packed = (fn as () => number)()
        if (typeof packed !== 'number' || packed < 0) return null
        return { line: packed >> 16, col: packed & 0xffff }
      } catch {
        return null
      }
    },
    setWasmClipboard(text) {
      if (typeof _raw._SetInnertaWasmClipboard !== 'function') return
      const ptr = toUtf8Ptr(_raw, text)
      _raw._SetInnertaWasmClipboard(ptr)
      _raw._free(ptr)
    },
    getSelectedText() {
      if (typeof _raw._GetInnertaSelectedText !== 'function') return ''
      const ptr = _raw._GetInnertaSelectedText() as number
      return (_raw.UTF8ToString as (p: number) => string)(ptr)
    },
    getText() {
      if (typeof _raw._GetInnertaText !== 'function') return ''
      const ptr = _raw._GetInnertaText() as number
      return (_raw.UTF8ToString as (p: number) => string)(ptr)
    },
    getRevision() {
      if (typeof _raw._GetInnertaRevision !== 'function') return 0
      return (_raw._GetInnertaRevision() as number) >>> 0
    },
    setCleanRevision(revision: number) {
      if (typeof _raw._SetInnertaCleanRevision !== 'function') return
      ;(_raw._SetInnertaCleanRevision as (r: number) => void)(revision >>> 0)
    },
    heapBytes() {
      // HEAP8 se exporta desde el build (EXPORTED_RUNTIME_METHODS): es el
      // heap lineal REAL del módulo, no una estimación.
      try {
        const heap = (_raw.HEAP8 ?? _raw.HEAPU8) as { length?: number } | undefined
        return typeof heap?.length === 'number' ? heap.length : 0
      } catch {
        return 0
      }
    },
    setBgColor(color) {
      _raw._SetInnertaBgColor(color)
    },
    setTerminalFont(fontPath) {
      if (typeof _raw._SetInnertaTerminalFont !== 'function') return
      const ptr = toUtf8Ptr(_raw, fontPath)
      _raw._SetInnertaTerminalFont(ptr)
      _raw._free(ptr)
    },
    getCharWidth() {
      if (typeof _raw._GetInnertaCharWidth !== 'function') return 0
      return _raw._GetInnertaCharWidth() as number
    },
    getLineHeight() {
      if (typeof _raw._GetInnertaLineHeight !== 'function') return 0
      return _raw._GetInnertaLineHeight() as number
    },
    resize(cols, rows) {
      if (typeof _raw._InnertaResize === 'function') {
        _raw._InnertaResize(cols, rows)
      }
    },
    // ── Terminal mouse protocol ────────────────────────────────────────
    terminalMouseButton(button, pressed, row, col, mods) {
      if (typeof _raw._InnertaTerminalMouseButton !== 'function') return
      _raw._InnertaTerminalMouseButton(button, pressed ? 1 : 0, row, col, mods)
    },
    terminalMouseMove(row, col, mods) {
      if (typeof _raw._InnertaTerminalMouseMove !== 'function') return
      _raw._InnertaTerminalMouseMove(row, col, mods)
    },
    /** Lee el buffer de salida de vterm (secuencias escape generadas por mouse protocol). */
    terminalReadOutput() {
      // Variante STRING: HEAPU8 NO está exportado por el módulo, así que la
      // variante buffer+HEAPU8 tiraba TypeError silencioso y el mouse protocol
      // NUNCA llegaba al PTY (solo la selección funcionaba, que es C++ puro).
      if (typeof _raw._InnertaTerminalReadOutputString !== 'function') return ''
      const ptr = _raw._InnertaTerminalReadOutputString() as number
      if (!ptr) return ''
      return (_raw.UTF8ToString as (p: number) => string)(ptr)
    },
    isAltScreen() {
      if (typeof _raw._InnertaIsAltScreen !== 'function') return false
      return (_raw._InnertaIsAltScreen() as number) !== 0
    },
    // ── Terminal selection (ES la selección del editor: m_selection) ──
    terminalHasSelection() {
      if (typeof _raw._InnertaTerminalHasSelection !== 'function') return false
      return (_raw._InnertaTerminalHasSelection() as number) !== 0
    },
    terminalGetSelectionText() {
      // El export devuelve const char* (un puntero): hay que leerlo con
      // UTF8ToString — devolver el puntero crudo copiaba un número.
      if (typeof _raw._InnertaTerminalGetSelectionText !== 'function') return ''
      const ptr = _raw._InnertaTerminalGetSelectionText() as number
      if (!ptr) return ''
      return (_raw.UTF8ToString as (p: number) => string)(ptr)
    },
    terminalClearSelection() {
      if (typeof _raw._InnertaTerminalClearSelection !== 'function') return
      _raw._InnertaTerminalClearSelection()
    },
    terminalGetCursorRow() {
      if (typeof _raw._InnertaTerminalGetCursorRow !== 'function') return -1
      return _raw._InnertaTerminalGetCursorRow() as number
    },
    terminalGetCursorCol() {
      if (typeof _raw._InnertaTerminalGetCursorCol !== 'function') return -1
      return _raw._InnertaTerminalGetCursorCol() as number
    },
    setAccentColor(color) {
      _raw._SetInnertaAccentColor(color)
    },
    setTextColor(color) {
      _raw._SetInnertaTextColor(color)
    },
    setBorderColor(color) {
      _raw._SetInnertaBorderColor(color)
    },
    setTextMutedColor(color) {
      _raw._SetInnertaTextMutedColor(color)
    },
    setIndentGuideColor(color) {
      _raw._SetInnertaIndentGuideColor(color)
    },
    setTokenColor(tokenTypeId, color) {
      _raw._SetInnertaTokenColor(tokenTypeId, color)
    },
    /**
     * Tokens de color del host (delta LSP) + fuente de resaltado.
     *
     * El array NO se puede pasar directo: el export C espera un PUNTERO del
     * heap, y la glue de emscripten coerciona un array JS a número (0 = NULL).
     * Ese era el fallo real del camino viejo: `_SetInnertaSemanticTokens(data,
     * data.length)` copiaba desde la dirección 0 — los tokens del LSP nunca
     * llegaron al motor y no había error visible.
     */
    setHostTokens(data: number[], source: number) {
      if (typeof _raw._SetInnertaHighlightSource === 'function') {
        _raw._SetInnertaHighlightSource(source)
      }
      if (typeof _raw._SetInnertaSemanticTokens !== 'function') return
      const arr = Int32Array.from(data)
      const ptr = arr.length > 0 ? (_raw._malloc as (n: number) => number)(arr.byteLength) : 0
      if (ptr !== 0) {
        ;((_raw.HEAP32) as Int32Array).set(arr, ptr >> 2)
      }
      ;(_raw._SetInnertaSemanticTokens as (p: number, c: number) => void)(ptr, arr.length)
      if (ptr !== 0) (_raw._free as (p: number) => void)(ptr)
    },
    setBookmarks(lines: number[]) {
      if (typeof _raw._SetInnertaBookmarks !== 'function') return
      const arr = Int32Array.from(lines)
      const ptr = (_raw._malloc as (n: number) => number)(arr.byteLength)
      ;((_raw.HEAP32) as Int32Array).set(arr, ptr >> 2)
      ;(_raw._SetInnertaBookmarks as (p: number, c: number) => void)(ptr, arr.length)
      ;(_raw._free as (p: number) => void)(ptr)
    },
    setCursor(line, col) {
      if (typeof _raw._SetInnertaCursor !== 'function') return
      ;(_raw._SetInnertaCursor as (line: number, col: number) => void)(line, col)
    },
    /** Ver `wrapIsolated()`: misma selección exacta del host. */
    setSelection(anchorLine, anchorCol, activeLine, activeCol) {
      if (typeof _raw._SetInnertaSelection !== 'function') return
      ;(_raw._SetInnertaSelection as (a: number, b: number, c: number, d: number) => void)(
        anchorLine,
        anchorCol,
        activeLine,
        activeCol
      )
    },
    /** Ver `wrapIsolated()`: mismos rangos plegables, misma trampa del puntero. */
    setFoldingRanges(ranges: number[]) {
      if (typeof _raw._SetInnertaFoldingRanges !== 'function') return
      const arr = Int32Array.from(ranges)
      const ptr = arr.length > 0 ? (_raw._malloc as (n: number) => number)(arr.byteLength) : 0
      if (ptr !== 0) ((_raw.HEAP32) as Int32Array).set(arr, ptr >> 2)
      ;(_raw._SetInnertaFoldingRanges as (p: number, c: number) => void)(ptr, arr.length)
      if (ptr !== 0) (_raw._free as (p: number) => void)(ptr)
    },
    /** Ver `wrapIsolated()`: mismo diagnóstico del plegado. */
    getFoldingCount() {
      if (typeof _raw._GetInnertaFoldingCount !== 'function') return -1
      return (_raw._GetInnertaFoldingCount as () => number)()
    },
    foldingIsHost() {
      if (typeof _raw._GetInnertaFoldingIsHost !== 'function') return false
      return (_raw._GetInnertaFoldingIsHost as () => number)() === 1
    },
    foldingFromEngine() {
      if (typeof _raw._GetInnertaFoldingFromEngine !== 'function') return false
      return (_raw._GetInnertaFoldingFromEngine as () => number)() === 1
    },
    /** Ver `wrapIsolated()`: mismo canal de subrayados. */
    setUnderlines(data: number[]) {
      pushUnderlines(_raw, data)
    },
    /** Ver `wrapIsolated()`: mismo diagnóstico del canal de subrayados. */
    getUnderlineCount() {
      if (typeof _raw._GetInnertaUnderlineCount !== 'function') return -1
      return (_raw._GetInnertaUnderlineCount as () => number)()
    }
  }
}

/**
 * Carga la glue de emscripten (public/innerta/innerta.js) y expone el contrato
 * InnertaModule sobre el canvas del host. Single-instancia para el editor.
 * Para terminal/bottom usamos instancia aislada para no robar el render.
 */
export function getInnertaModule(canvas: HTMLCanvasElement): Promise<InnertaModule> {
  currentCanvas = canvas
  if (!pending) {
    pending = (async (): Promise<InnertaModule> => {
      await injectScript()
      if (typeof window.createInnertaModule !== 'function') {
        throw new Error('createInnertaModule no disponible (¿innerta.js cargó bien?)')
      }
      // El canvas se lee en vivo: init() lo retargetea (remount/StrictMode).
      let rawRef: Record<string, unknown> | null = null
      const raw = await withGuardedKeyboardListeners(
        (): HTMLCanvasElement | null =>
          ((rawRef?.canvas as HTMLCanvasElement | undefined) ?? currentCanvas ?? null),
        () =>
          window.createInnertaModule!(
            innertaModuleConfig(currentCanvas ?? canvas) as never
          )
      )
      rawRef = raw as Record<string, unknown>
      rawModule = rawRef
      return wrap(rawRef)
    })()
  }
  return pending
}

/**
 * Crea una instancia AISLADA de Innerta para terminal/bottom.
 * Cada terminal tiene su propio Module + canvas + loop, no comparte el singleton del editor.
 * Así editor y terminal conviven como 2 Innertas reales (mismo binario, distinto `mode`).
 */
export async function createIsolatedInnertaModule(canvas: HTMLCanvasElement): Promise<InnertaModule> {
  await injectScript()
  if (typeof window.createInnertaModule !== 'function') {
    throw new Error('createInnertaModule no disponible')
  }
  let rawRef: Record<string, unknown> | null = null
  const raw = await withGuardedKeyboardListeners(
    (): HTMLCanvasElement | null =>
      ((rawRef?.canvas as HTMLCanvasElement | undefined) ?? canvas),
    () =>
      window.createInnertaModule!(
        innertaModuleConfig(canvas) as never
      )
  )
  rawRef = raw as Record<string, unknown>
  return wrapIsolated(rawRef, canvas)
}

function wrapIsolated(raw: Record<string, unknown>, canvas: HTMLCanvasElement): InnertaModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _raw = raw as Record<string, any>
  let inited = false
  // Misma API que wrap() pero sin tocar currentCanvas global
  const mod: InnertaModule = {
    init(x: number, y: number, w: number, h: number) {
      _raw.canvas = canvas
      // Mismo guard que el editor: los key handlers globales del puerto GLFW
      // se registran en InitInnerta, no al crear el módulo aislado.
      withKeyboardListenerGuard(() => canvas, () => {
        _raw._InitInnerta(0, x, y, w, h)
        _raw._SetInnertaVisible(1)
        _raw._SetInnertaBounds(x, y, w, h)
      })
      inited = true
    },
    shutdown() {
      if (!inited) return
      _raw._ShutdownInnerta()
      // Soltar la referencia cruda: hostBridge/viewFactory la leen vía
      // `_rawModuleRef` y la retendrían (heap WASM entero) tras el destroy.
      ;(mod as unknown as Record<string, unknown>)._rawModuleRef = undefined
    },
    frame() {
      _raw._InnertaFrame()
    },
    setContent(text) {
      const ptr = toUtf32Ptr(_raw, text)
      _raw._SetInnertaContent(ptr)
      _raw._free(ptr)
      if (typeof _raw._InnertaEnsureVisible === 'function') _raw._InnertaEnsureVisible()
    },
    openFile(path, content) {
      const pathPtr = toUtf32Ptr(_raw, path)
      _raw._OpenInnertaFile(pathPtr)
      _raw._free(pathPtr)
      if (content.length > 0) {
        const cPtr = toUtf32Ptr(_raw, content)
        _raw._SetInnertaContent(cPtr)
        _raw._free(cPtr)
      }
      const lang = detectLanguageFromPath(path)
      if (lang && typeof _raw._SetInnertaLanguage === 'function') {
        const langPtr = toUtf32Ptr(_raw, lang)
        _raw._SetInnertaLanguage(langPtr)
        _raw._free(langPtr)
      }
      if (typeof _raw._SetInnertaBreadcumbFilename === 'function') {
        const filename = path.split(/[/\\]/).pop() ?? path
        const namePtr = toUtf32Ptr(_raw, filename)
        _raw._SetInnertaBreadcumbFilename(namePtr)
        _raw._free(namePtr)
      }
      if (typeof _raw._InnertaEnsureVisible === 'function') _raw._InnertaEnsureVisible()
    },
    setLanguage(language) {
      if (typeof _raw._SetInnertaLanguage === 'function') {
        const ptr = toUtf32Ptr(_raw, language)
        _raw._SetInnertaLanguage(ptr)
        _raw._free(ptr)
      }
    },
    setBounds(x, y, w, h) {
      _raw._SetInnertaBounds(x, y, w, h)
    },
    setFocus(focused) {
      _raw._SetInnertaFocus(focused ? 1 : 0)
    },
    setTheme(theme) {
      const ptr = toUtf32Ptr(_raw, theme)
      _raw._SetInnertaTheme(ptr)
      _raw._free(ptr)
    },
    setMinimapVisible(visible: boolean) {
      if (typeof _raw._SetInnertaMinimapVisible !== 'function') return
      ;(_raw._SetInnertaMinimapVisible as (v: number) => void)(visible ? 1 : 0)
    },
    mouseMove(x, y) {
      _raw._InnertaMouseMove(x, y)
    },
    mouseLeave() {
      _raw._InnertaMouseLeave()
    },
    mouseButton(button, action, mods) {
      _raw._InnertaMouseButton(button, action, mods)
    },
    scroll(x, y) {
      _raw._InnertaScroll(x, y)
    },
    key(key, action, mods) {
      _raw._InnertaKey(key, action, mods)
    },
    char(codepoint) {
      _raw._InnertaChar(codepoint)
    },
    hitTest(x, y) {
      if (typeof _raw._InnertaHitTest !== 'function') return { line: -1, col: -1 }
      const packed = _raw._InnertaHitTest(x, y) as number
      if (packed < 0) return { line: -1, col: -1 }
      return { line: packed >> 16, col: packed & 0xffff }
    },
    /** X donde arranca el texto (ancho del gutter); `null` si el WASM no lo trae. */
    getTextXOffset() {
      const fn = (_raw as Record<string, unknown>)['_GetInnertaTextXOffset']
      if (typeof fn !== 'function') return null
      try {
        const value = (fn as () => number)()
        return typeof value === 'number' && value >= 0 ? value : null
      } catch {
        return null
      }
    },
    getCursor() {
      const fn = (_raw as Record<string, unknown>)['_GetInnertaCursor']
      if (typeof fn !== 'function') return null
      try {
        const packed = (fn as () => number)()
        if (typeof packed !== 'number' || packed < 0) return null
        return { line: packed >> 16, col: packed & 0xffff }
      } catch {
        return null
      }
    },
    setWasmClipboard(text) {
      if (typeof _raw._SetInnertaWasmClipboard !== 'function') return
      const ptr = toUtf8Ptr(_raw, text)
      _raw._SetInnertaWasmClipboard(ptr)
      _raw._free(ptr)
    },
    getSelectedText() {
      if (typeof _raw._GetInnertaSelectedText !== 'function') return ''
      const ptr = _raw._GetInnertaSelectedText() as number
      return (_raw.UTF8ToString as (p: number) => string)(ptr)
    },
    getText() {
      if (typeof _raw._GetInnertaText !== 'function') return ''
      const ptr = _raw._GetInnertaText() as number
      return (_raw.UTF8ToString as (p: number) => string)(ptr)
    },
    getRevision() {
      if (typeof _raw._GetInnertaRevision !== 'function') return 0
      return (_raw._GetInnertaRevision() as number) >>> 0
    },
    setCleanRevision(revision: number) {
      if (typeof _raw._SetInnertaCleanRevision !== 'function') return
      ;(_raw._SetInnertaCleanRevision as (r: number) => void)(revision >>> 0)
    },
    heapBytes() {
      // HEAP8 se exporta desde el build (EXPORTED_RUNTIME_METHODS): es el
      // heap lineal REAL del módulo, no una estimación.
      try {
        const heap = (_raw.HEAP8 ?? _raw.HEAPU8) as { length?: number } | undefined
        return typeof heap?.length === 'number' ? heap.length : 0
      } catch {
        return 0
      }
    },
    setBgColor(color) {
      _raw._SetInnertaBgColor(color)
    },
    setTerminalFont(fontPath) {
      if (typeof _raw._SetInnertaTerminalFont !== 'function') return
      const ptr = toUtf8Ptr(_raw, fontPath)
      _raw._SetInnertaTerminalFont(ptr)
      _raw._free(ptr)
    },
    getCharWidth() {
      if (typeof _raw._GetInnertaCharWidth !== 'function') return 0
      return _raw._GetInnertaCharWidth() as number
    },
    getLineHeight() {
      if (typeof _raw._GetInnertaLineHeight !== 'function') return 0
      return _raw._GetInnertaLineHeight() as number
    },
    resize(cols, rows) {
      if (typeof _raw._InnertaResize === 'function') {
        _raw._InnertaResize(cols, rows)
      }
    },
    // ── Terminal mouse protocol ────────────────────────────────────────
    terminalMouseButton(button, pressed, row, col, mods) {
      if (typeof _raw._InnertaTerminalMouseButton !== 'function') return
      _raw._InnertaTerminalMouseButton(button, pressed ? 1 : 0, row, col, mods)
    },
    terminalMouseMove(row, col, mods) {
      if (typeof _raw._InnertaTerminalMouseMove !== 'function') return
      _raw._InnertaTerminalMouseMove(row, col, mods)
    },
    /** Lee el buffer de salida de vterm (secuencias escape generadas por mouse protocol). */
    terminalReadOutput() {
      // Variante STRING: HEAPU8 NO está exportado por el módulo, así que la
      // variante buffer+HEAPU8 tiraba TypeError silencioso y el mouse protocol
      // NUNCA llegaba al PTY (solo la selección funcionaba, que es C++ puro).
      if (typeof _raw._InnertaTerminalReadOutputString !== 'function') return ''
      const ptr = _raw._InnertaTerminalReadOutputString() as number
      if (!ptr) return ''
      return (_raw.UTF8ToString as (p: number) => string)(ptr)
    },
    isAltScreen() {
      if (typeof _raw._InnertaIsAltScreen !== 'function') return false
      return (_raw._InnertaIsAltScreen() as number) !== 0
    },
    // ── Terminal selection (ES la selección del editor: m_selection) ──
    terminalHasSelection() {
      if (typeof _raw._InnertaTerminalHasSelection !== 'function') return false
      return (_raw._InnertaTerminalHasSelection() as number) !== 0
    },
    terminalGetSelectionText() {
      // El export devuelve const char* (un puntero): hay que leerlo con
      // UTF8ToString — devolver el puntero crudo copiaba un número.
      if (typeof _raw._InnertaTerminalGetSelectionText !== 'function') return ''
      const ptr = _raw._InnertaTerminalGetSelectionText() as number
      if (!ptr) return ''
      return (_raw.UTF8ToString as (p: number) => string)(ptr)
    },
    terminalClearSelection() {
      if (typeof _raw._InnertaTerminalClearSelection !== 'function') return
      _raw._InnertaTerminalClearSelection()
    },
    terminalGetCursorRow() {
      if (typeof _raw._InnertaTerminalGetCursorRow !== 'function') return -1
      return _raw._InnertaTerminalGetCursorRow() as number
    },
    terminalGetCursorCol() {
      if (typeof _raw._InnertaTerminalGetCursorCol !== 'function') return -1
      return _raw._InnertaTerminalGetCursorCol() as number
    },
    setAccentColor(color) {
      _raw._SetInnertaAccentColor(color)
    },
    setTextColor(color) {
      _raw._SetInnertaTextColor(color)
    },
    setBorderColor(color) {
      _raw._SetInnertaBorderColor(color)
    },
    setTextMutedColor(color) {
      _raw._SetInnertaTextMutedColor(color)
    },
    setIndentGuideColor(color) {
      _raw._SetInnertaIndentGuideColor(color)
    },
    setTokenColor(tokenTypeId, color) {
      _raw._SetInnertaTokenColor(tokenTypeId, color)
    },
    /**
     * Tokens de color del host (delta LSP) + fuente de resaltado.
     *
     * El array NO se puede pasar directo: el export C espera un PUNTERO del
     * heap, y la glue de emscripten coerciona un array JS a número (0 = NULL).
     * Ese era el fallo real del camino viejo: `_SetInnertaSemanticTokens(data,
     * data.length)` copiaba desde la dirección 0 — los tokens del LSP nunca
     * llegaron al motor y no había error visible.
     */
    setHostTokens(data: number[], source: number) {
      if (typeof _raw._SetInnertaHighlightSource === 'function') {
        _raw._SetInnertaHighlightSource(source)
      }
      if (typeof _raw._SetInnertaSemanticTokens !== 'function') return
      const arr = Int32Array.from(data)
      const ptr = arr.length > 0 ? (_raw._malloc as (n: number) => number)(arr.byteLength) : 0
      if (ptr !== 0) {
        ;((_raw.HEAP32) as Int32Array).set(arr, ptr >> 2)
      }
      ;(_raw._SetInnertaSemanticTokens as (p: number, c: number) => void)(ptr, arr.length)
      if (ptr !== 0) (_raw._free as (p: number) => void)(ptr)
    },
    setBookmarks(lines: number[]) {
      if (typeof _raw._SetInnertaBookmarks !== 'function') return
      const arr = Int32Array.from(lines)
      const ptr = (_raw._malloc as (n: number) => number)(arr.byteLength)
      ;((_raw.HEAP32) as Int32Array).set(arr, ptr >> 2)
      ;(_raw._SetInnertaBookmarks as (p: number, c: number) => void)(ptr, arr.length)
      ;(_raw._free as (p: number) => void)(ptr)
    },
    setCursor(line, col) {
      if (typeof _raw._SetInnertaCursor !== 'function') return
      ;(_raw._SetInnertaCursor as (line: number, col: number) => void)(line, col)
    },
    /** Selección exacta del host (expandir selección con `textobjects.scm`). */
    setSelection(anchorLine, anchorCol, activeLine, activeCol) {
      if (typeof _raw._SetInnertaSelection !== 'function') return
      ;(_raw._SetInnertaSelection as (a: number, b: number, c: number, d: number) => void)(
        anchorLine,
        anchorCol,
        activeLine,
        activeCol
      )
    },
    /**
     * Rangos plegables del host: mismo patrón de puntero que bookmarks/tokens.
     *
     * Array VACÍO = "el host no tiene rangos": se llama igual con `count = 0`
     * para que el motor vuelva a sus rangos por indentación. Omitir la llamada
     * dejaría pegados los fold del árbol del archivo anterior.
     */
    setFoldingRanges(ranges: number[]) {
      if (typeof _raw._SetInnertaFoldingRanges !== 'function') return
      const arr = Int32Array.from(ranges)
      const ptr = arr.length > 0 ? (_raw._malloc as (n: number) => number)(arr.byteLength) : 0
      if (ptr !== 0) ((_raw.HEAP32) as Int32Array).set(arr, ptr >> 2)
      ;(_raw._SetInnertaFoldingRanges as (p: number, c: number) => void)(ptr, arr.length)
      if (ptr !== 0) (_raw._free as (p: number) => void)(ptr)
    },
    /**
     * Diagnóstico del plegado: cuántos rangos tiene el motor AHORA y si son los
     * del host.
     *
     * Es la ÚNICA forma de que el host sepa que sus rangos llegaron de verdad:
     * `setFoldingRanges` es `void`, así que el motor reporta su propio estado.
     * `-1` = build sin el getter (se dice, no se finge un cero).
     */
    getFoldingCount() {
      if (typeof _raw._GetInnertaFoldingCount !== 'function') return -1
      return (_raw._GetInnertaFoldingCount as () => number)()
    },
    foldingIsHost() {
      if (typeof _raw._GetInnertaFoldingIsHost !== 'function') return false
      return (_raw._GetInnertaFoldingIsHost as () => number)() === 1
    },
    /**
     * ¿Los rangos los calculó el MOTOR con su `folds.scm`?
     *
     * `foldingIsHost` responde "no es indentación", que ahora tiene dos causas
     * (gramática dinámica del host o la query del lenguaje embebido). Sin esto, el
     * diagnóstico diría "del host" para un lenguaje de fábrica.
     */
    foldingFromEngine() {
      if (typeof _raw._GetInnertaFoldingFromEngine !== 'function') return false
      return (_raw._GetInnertaFoldingFromEngine as () => number)() === 1
    },
    /**
     * Subrayados del host, como SEXTUPLETES (ver `wrapUnderlinePayload`).
     *
     * Mismo patrón de puntero que bookmarks/tokens/plegado: el export C espera
     * un `const int*` del heap y un array de JS se coerciona a número (0 =
     * NULL). Un array VACÍO es la orden de limpiar (count = 0): es lo que se
     * manda al abrir otro archivo, y sin eso el motor se queda con los
     * subrayados del archivo anterior.
     */
    setUnderlines(data: number[]) {
      pushUnderlines(_raw, data)
    },
    /**
     * Diagnóstico del canal: cuántos subrayados tiene el motor AHORA.
     *
     * `setUnderlines` es `void`, así que sin este getter el puente sólo puede
     * afirmar "mandé los rangos". `-1` = build sin el getter (se dice, no se
     * finge un cero).
     */
    getUnderlineCount() {
      if (typeof _raw._GetInnertaUnderlineCount !== 'function') return -1
      return (_raw._GetInnertaUnderlineCount as () => number)()
    }
  }
  ;(mod as unknown as Record<string, unknown>)._rawModuleRef = raw
  return mod as unknown as InnertaModule
}

/**
 * Empuja la lista de subrayados al motor (sextupletes de ints).
 *
 * El formato lo define el motor (ver `SetInnertaUnderlines`):
 *
 *   (startLine, startCol, endLine, endCol, rgba, style)
 *
 * con columnas 0-based, `rgba` en el MISMO orden que el resto del puente
 * (0xRRGGBBAA — el C++ lo lee con `ColorFromRGBA`) y `style` 0 ondulada / 1
 * recta / 2 punteada / 3 doble. Se comparte entre la instancia compartida y
 * las aisladas a propósito: dos copias de este marshalling es exactamente cómo
 * una de las dos se queda con el bug.
 */
function pushUnderlines(raw: Record<string, unknown>, data: number[]): void {
  const fn = raw['_SetInnertaUnderlines']
  if (typeof fn !== 'function') return
  const arr = Int32Array.from(data)
  const malloc = (raw['_malloc'] as (n: number) => number) ?? undefined
  const free = (raw['_free'] as (p: number) => void) ?? undefined
  const ptr = arr.length > 0 && malloc ? malloc(arr.byteLength) : 0
  if (ptr !== 0) ((raw['HEAP32']) as Int32Array).set(arr, ptr >> 2)
  ;(fn as (p: number, c: number) => void)(ptr, arr.length)
  if (ptr !== 0 && free) free(ptr)
}
import type { InnertaModule } from './InnertaEngine'
import { detectLanguageFromPath } from '../../languages'

declare global {
  interface Window {
    createInnertaModule?: (config?: Record<string, unknown>) => Promise<unknown>
  }
}

let pending: Promise<InnertaModule> | null = null
let scriptInjected = false
/** Canvas del host activo: se retargetea en init() (ver wrap). */
let currentCanvas: HTMLCanvasElement | null = null

function injectScript(): Promise<void> {
  if (scriptInjected) return Promise.resolve()
  scriptInjected = true
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = '/innerta/innerta.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptInjected = false
      reject(new Error('No se pudo cargar /innerta/innerta.js'))
    }
    document.head.appendChild(s)
  })
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
    init(x, y, w, h) {
      // El puerto GLFW de emscripten lee Module['canvas'] durante InitInnerta.
      // Se asigna acá (no al crear el módulo): así el canvas es el del host
      // activo aunque el panel se haya remontado (p. ej. StrictMode en dev).
      if (currentCanvas) _raw.canvas = currentCanvas
      _raw._InitInnerta(0, x, y, w, h)
      _raw._SetInnertaVisible(1)
      _raw._SetInnertaBounds(x, y, w, h)
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
    setBgColor(color) {
      _raw._SetInnertaBgColor(color)
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
  }
}

/**
 * Carga la glue de emscripten (public/innerta/innerta.js) y expone el contrato
 * InnertaModule sobre el canvas del host. Single-instancia.
 */
export function getInnertaModule(canvas: HTMLCanvasElement): Promise<InnertaModule> {
  currentCanvas = canvas
  if (!pending) {
    pending = (async (): Promise<InnertaModule> => {
      await injectScript()
      if (typeof window.createInnertaModule !== 'function') {
        throw new Error('createInnertaModule no disponible (¿innerta.js cargó bien?)')
      }
      const raw = await window.createInnertaModule({ canvas: currentCanvas ?? canvas })
      return wrap(raw as Record<string, unknown>)
    })()
  }
  return pending
}
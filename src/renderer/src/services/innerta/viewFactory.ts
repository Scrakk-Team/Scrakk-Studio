// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Innerta View Factory — capa JS sobre innerta.wasm.
 * Expone createEditor / createTerminal como vistas del mismo renderer.
 * Cada vista comparte el GpuContext/FontAtlas pero tiene opts distintas.
 * Esta es la API que consume la extensión builtin `innerta-bridge`.
 */
import {
  getInnertaModule,
  getInnertaRawModule,
  createIsolatedInnertaModule
} from '@features/editor/engines/innerta/innertaLoader'
import type { InnertaModule } from '@features/editor/engines/innerta/InnertaEngine'

export type InnertaViewMode = 'custom' | 'editor' | 'terminal' | 'preview'
export type InnertaViewOpts = {
  mode?: InnertaViewMode
  lsp?: boolean
  syntax?: boolean
  folding?: boolean
  lineNumbers?: boolean
  readOnly?: boolean
  cursorStyle?: 'bar' | 'block'
  cursorBlink?: boolean
}

export type InnertaViewHandle = {
  id: string
  module: InnertaModule
  opts: Required<InnertaViewOpts>
  append(text: string): void
  setContent(text: string): void
  resize(cols: number, rows: number): void
  focus(): void
  dispose(): void
}

const DEFAULT_OPTS: Required<InnertaViewOpts> & { mode: InnertaViewMode } = {
  mode: 'editor',
  lsp: true,
  syntax: true,
  folding: true,
  lineNumbers: true,
  readOnly: false,
  cursorStyle: 'bar',
  cursorBlink: true
}

function resolveOpts(opts?: InnertaViewOpts): Required<InnertaViewOpts> & { mode: InnertaViewMode } {
  const mode = opts?.mode ?? DEFAULT_OPTS.mode
  if (mode === 'terminal') {
    return {
      lsp: false,
      syntax: false,
      folding: false,
      lineNumbers: false,
      readOnly: true,
      cursorStyle: 'block' as const,
      cursorBlink: true,
      ...opts,
      mode: 'terminal' as const
    }
  }
  if (mode === 'editor') {
    return {
      lsp: true,
      syntax: true,
      folding: true,
      lineNumbers: true,
      readOnly: false,
      cursorStyle: 'bar' as const,
      cursorBlink: true,
      ...opts,
      mode: 'editor' as const
    }
  }
  return { ...DEFAULT_OPTS, ...opts, mode: mode as InnertaViewMode }
}

// Raw por vista aislada (terminal) para no robar el singleton del editor
const rawByViewId = new Map<string, Record<string, unknown>>()
const rafByViewId = new Map<string, number>()

export async function createInnertaView(
  canvas: HTMLCanvasElement,
  id: string,
  opts?: InnertaViewOpts
): Promise<InnertaViewHandle> {
  const resolved = resolveOpts(opts)
  const isTerminal = resolved.mode === 'terminal'
  const module = isTerminal ? await createIsolatedInnertaModule(canvas) : await getInnertaModule(canvas)
  const raw: Record<string, unknown> | null = isTerminal
    ? ((module as unknown as Record<string, unknown>)._rawModuleRef as Record<string, unknown> | undefined) ??
      (getInnertaRawModule() as Record<string, unknown> | null)
    : (getInnertaRawModule() as Record<string, unknown> | null)
  if (isTerminal && raw) rawByViewId.set(id, raw)

  if (isTerminal) {
    try {
      const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800
      const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 300
      module.init(0, 0, w, h)
      module.setFocus(true)
      try {
        const { applyInnertaTheme } = await import('@features/editor/engines/innerta/innertaTheme')
        applyInnertaTheme(module)
      } catch {}
      const loop = (): void => {
        if (!rawByViewId.has(id)) return
        module.frame()
        const raf = requestAnimationFrame(loop)
        rafByViewId.set(id, raf)
      }
      const raf = requestAnimationFrame(loop)
      rafByViewId.set(id, raf)
      const ro = new ResizeObserver(() => {
        const host = canvas.parentElement
        if (!host) return
        module.setBounds(0, 0, host.clientWidth, host.clientHeight)
      })
      if (canvas.parentElement) ro.observe(canvas.parentElement)
      ;(module as unknown as Record<string, unknown>)._ro = ro
    } catch {}
  }

  // Un solo camino de creación para editor y terminal: el spawn declara
  // mode + flags y C++ aplica el preset vía ApplyViewOpts (la única fuente
  // de verdad). En WASM cada módulo es 1 vista, así que la vista ES la
  // ventana del módulo. Ya no hay toggles sueltos (_SetInnertaTerminalMode /
  // _SetInnertaGutterVisible) hardcodeados desde afuera.
  if (raw && typeof raw['_InnertaCreateView'] === 'function') {
    try {
      const { _malloc, stringToUTF8, lengthBytesUTF8 } = raw as Record<string, (...a: never[]) => unknown>
      const setValue = raw['setValue'] as ((p: number, v: number, t: string) => void) | undefined
      if (typeof setValue === 'function') {
        const idBytes = (lengthBytesUTF8 as (s: string) => number)(id) + 1
        const idPtr = (_malloc as (n: number) => number)(idBytes)
        ;(stringToUTF8 as (s: string, p: number, n: number) => void)(id, idPtr, idBytes)
        // InnertaViewOpts = 9 × int32 (mode + 8 flags + themeJson=NULL) = 36 bytes.
        // Se escribe con setValue (runtime exportado): HEAP32/HEAPU32 NO están
        // exportados por el módulo, así que escribirlos dejaba el struct con
        // basura de malloc → el preset se aplicaba ALEATORIO ("la API sirve
        // cuando quiere"). Sin setValue (binario viejo) se saltea CreateView y
        // FeedVt fuerza modo terminal de forma determinística.
        const optsPtr = (_malloc as (n: number) => number)(36)
        if (optsPtr) {
          const modeMap: Record<InnertaViewMode, number> = { custom: 0, editor: 1, terminal: 2, preview: 3 }
          const fields = [
            modeMap[resolved.mode] ?? 1,
            resolved.lsp ? 1 : 0,
            resolved.syntax ? 1 : 0,
            resolved.folding ? 1 : 0,
            resolved.lineNumbers ? 1 : 0,
            resolved.readOnly ? 1 : 0,
            resolved.cursorStyle === 'block' ? 1 : 0,
            resolved.cursorBlink ? 1 : 0,
            0 // themeJson = NULL
          ]
          for (let i = 0; i < fields.length; i++) setValue(optsPtr + i * 4, fields[i], 'i32')
          ;(raw['_InnertaCreateView'] as (a: number, b: number) => unknown)(idPtr, optsPtr)
          ;(raw['_free'] as (p: number) => void)(optsPtr)
        }
        ;(raw['_free'] as (p: number) => void)(idPtr)
      }
    } catch {}
  }

  return {
    id,
    module,
    opts: resolved,
    append(text: string) {
      if (resolved.mode === 'terminal') {
        const rawFeed = (rawByViewId.get(id) ?? raw) as Record<string, unknown> | null
        if (rawFeed && typeof rawFeed['_InnertaFeedVt'] === 'function') {
          try {
            // El PTY real (node-pty) ya entrega \r\n correcto al renderer;
            // libvterm procesa el VT completo (SGR, OSC 133, scroll).
            const { _malloc, stringToUTF8, lengthBytesUTF8 } = rawFeed as Record<string, (...a: never[]) => unknown>
            const bytes = (lengthBytesUTF8 as (s: string) => number)(text) + 1
            const ptr = (_malloc as (n: number) => number)(bytes)
            ;(stringToUTF8 as (s: string, p: number, n: number) => void)(text, ptr, bytes)
            ;(rawFeed['_InnertaFeedVt'] as (p: number) => void)(ptr)
            ;(rawFeed['_free'] as (p: number) => void)(ptr)
            return
          } catch {}
        }
      }
      const cur = module.getText?.() ?? ''
      module.setContent(cur + text)
    },
    setContent(text: string) {
      if (resolved.mode === 'terminal') {
        const rawFeed = (rawByViewId.get(id) ?? raw) as Record<string, unknown> | null
        if (rawFeed && typeof rawFeed['_InnertaFeedVt'] === 'function') {
          try {
            // Limpiar y feed
            const { _malloc, stringToUTF8, lengthBytesUTF8 } = rawFeed as Record<string, (...a: never[]) => unknown>
            // Clear via VT reset: feed \x1b[2J\x1b[H y luego texto
            const clear = '\x1b[2J\x1b[H'
            const cBytes = (lengthBytesUTF8 as (s: string) => number)(clear) + 1
            const cPtr = (_malloc as (n: number) => number)(cBytes)
            ;(stringToUTF8 as (s: string, p: number, n: number) => void)(clear, cPtr, cBytes)
            ;(rawFeed['_InnertaFeedVt'] as (p: number) => void)(cPtr)
            ;(rawFeed['_free'] as (p: number) => void)(cPtr)
            const bytes = (lengthBytesUTF8 as (s: string) => number)(text) + 1
            const ptr = (_malloc as (n: number) => number)(bytes)
            ;(stringToUTF8 as (s: string, p: number, n: number) => void)(text, ptr, bytes)
            ;(rawFeed['_InnertaFeedVt'] as (p: number) => void)(ptr)
            ;(rawFeed['_free'] as (p: number) => void)(ptr)
            return
          } catch {}
        }
      }
      module.setContent(text)
    },
    resize(cols: number, rows: number) {
      // Notificar al PTY (via IPC) — resize del shell real
      const api = (window as unknown as { api?: { terminal?: {
        resize: (r: unknown) => Promise<void>
      } } }).api?.terminal
      if (api) void api.resize({ id, cols, rows })
      // Tambien resizear el VtParser en WASM para que PTY y grid
      // SIEMPRE tengan las mismas dimensiones.
      const rawResize = (rawByViewId.get(id) ?? getInnertaRawModule()) as Record<string, unknown> | null
      if (rawResize && typeof rawResize['_InnertaResize'] === 'function') {
        (rawResize['_InnertaResize'] as (c: number, r: number) => void)(cols, rows)
      }
    },
    focus() {
      module.setFocus(true)
      canvas.focus()
    },
    dispose() {
      const raf = rafByViewId.get(id)
      if (raf) {
        cancelAnimationFrame(raf)
        rafByViewId.delete(id)
      }
      const ro = (module as unknown as Record<string, unknown>)._ro as ResizeObserver | undefined
      if (ro) {
        try { ro.disconnect() } catch {}
      }
      const rawDispose = (rawByViewId.get(id) ?? getInnertaRawModule()) as Record<string, unknown> | null
      if (rawDispose && typeof rawDispose['_InnertaDestroyView'] === 'function') {
        try {
          const { _malloc, stringToUTF8, lengthBytesUTF8 } = rawDispose as Record<string, (...a: never[]) => unknown>
          const idBytes = (lengthBytesUTF8 as (s: string) => number)(id) + 1
          const idPtr = (_malloc as (n: number) => number)(idBytes)
          ;(stringToUTF8 as (s: string, p: number, n: number) => void)(id, idPtr, idBytes)
          ;(rawDispose['_InnertaDestroyView'] as (p: number) => void)(idPtr)
          ;(rawDispose['_free'] as (p: number) => void)(idPtr)
        } catch {}
      }
      rawByViewId.delete(id)
      try { module.shutdown() } catch {}
    }
  }
}

export function createEditorView(canvas: HTMLCanvasElement, id: string): Promise<InnertaViewHandle> {
  return createInnertaView(canvas, id, { mode: 'editor' })
}

export function createTerminalView(canvas: HTMLCanvasElement, id: string): Promise<InnertaViewHandle> {
  return createInnertaView(canvas, id, { mode: 'terminal' })
}

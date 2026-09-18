import { useEffect, useRef, type JSX } from 'react'
import { createTerminalView, type InnertaViewHandle } from '@services/innerta/viewFactory'
import { wireInnertaInput } from '@features/editor/engines/innerta/innertaInput'
import { applyInnertaTheme, listenThemeChanges } from '@features/editor/engines/innerta/innertaTheme'

/**
 * InnertaTerminalPanel — panel `innerta-terminal` contribuido por la extensión
 * builtin `innerta-terminal`. No hardcodea el renderer en el core del IDE:
 * es la extensión quien crea la vista terminal vía `createTerminalView()`.
 *
 * La vista es un render normal del editor con:
 *   lsp=false, syntax=false, folding=false, readOnly=true, cursor=block
 * y un PTY en el fondo (`window.api.terminal` cuando exista, por ahora mock).
 */
export default function InnertaTerminalPanel(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<InnertaViewHandle | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = 'scrakk-innerta-canvas'
    canvas.tabIndex = 0
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    host.appendChild(canvas)

    const termId = `term-${Date.now()}`
    let cancelled = false
    let unsubData: (() => void) | null = null
    let unsubExit: (() => void) | null = null

    // Guardar la promesa: si el cleanup corre ANTES de que resuelva (StrictMode
    // desmonta y remonta), el view se puede disponer igual al resolver — si no,
    // el módulo aislado queda vivo con su rAF loop corriendo para siempre.
    let viewPromise: Promise<InnertaViewHandle> | null = null
    viewPromise = createTerminalView(canvas, termId)
    viewPromise.then(async (view) => {
      if (cancelled) return
      viewRef.current = view
      view.focus()

      // Font: detectar la fuente monospace del sistema, escribirla al WASM FS,
      // y setTerminalFont ANTES de crear el PTY para que getRealDims() use
      // las metricas correctas de la fuente del sistema.
      try {
        const fontApi = (window as unknown as { api?: { terminal?: { getMonoFont: () => Promise<{ data: number[] } | null> } } }).api?.terminal
        const mod = view.module as unknown as import('@features/editor/engines/innerta/InnertaEngine').InnertaModule
        const raw = view.module as unknown as Record<string, unknown>
        const fsApi = (raw as { FS?: { writeFile: (p: string, d: Uint8Array) => void } }).FS
        if (fontApi && fsApi) {
          const result = await fontApi.getMonoFont()
          if (cancelled) return
          if (result?.data?.length) {
            fsApi.writeFile('/fonts/terminal/system-mono.ttf', new Uint8Array(result.data))
            mod.setTerminalFont('/fonts/terminal/system-mono.ttf')
          } else {
            mod.setTerminalFont('/fonts/terminal/JetBrainsMono-Regular.ttf')
          }
        } else {
          mod.setTerminalFont('/fonts/terminal/JetBrainsMono-Regular.ttf')
        }
      } catch {}

      // Theme: misma pipeline que el editor, aplicar al módulo aislado
      try {
        applyInnertaTheme(view.module as unknown as import('@features/editor/engines/innerta/InnertaEngine').InnertaModule)
      } catch {}
      const unsubTheme = listenThemeChanges(() => {
        try {
          applyInnertaTheme(view.module as unknown as import('@features/editor/engines/innerta/InnertaEngine').InnertaModule)
        } catch {}
      })

      // Gutter/line numbers: ya los desactiva el preset TERMINAL aplicado en
      // InnertaCreateView (ApplyViewOpts) — no hay toggles sueltos acá.

      // Calcular dims REALES: esperar a que el módulo WASM tenga las métricas correctas
      // (getCharWidth puede retornar el fallback8 antes de que el font cargue)
      const getRealDims = (): { cols: number; rows: number } => {
        const cw = (view.module as unknown as { getCharWidth?: () => number }).getCharWidth?.() ?? 0
        const lh = (view.module as unknown as { getLineHeight?: () => number }).getLineHeight?.() ?? 0
        const w = host?.clientWidth ?? canvas.clientWidth
        const h = host?.clientHeight ?? canvas.clientHeight
        if (cw > 0 && lh > 0 && w > 0 && h > 0) {
          return { cols: Math.floor(w / cw), rows: Math.floor(h / lh) }
        }
        return { cols: 80, rows: 24 }
      }

      // Resize: notificar PTY cuando el panel cambia de tamaño
      const resizeRo = new ResizeObserver(() => {
        if (!host || !api) return
        const dims = getRealDims()
        view.resize(dims.cols, dims.rows)
      })
      resizeRo.observe(host)

      // Flush vterm output: después de cada mouse/wheel event, leer el buffer de
      // salida de vterm (que puede contener xterm mouse protocol sequences) y
      // enviarlo al PTY. Esto permite que CLIs como vim/less reciban mouse events.
      const flushVtermOutput = (): void => {
        try {
          const mod = view.module as unknown as Record<string, unknown>
          const readFn = mod.terminalReadOutput as (() => string) | undefined
          if (readFn) {
            const output = readFn()
            if (output && output.length > 0) {
              const apiInner = (window as unknown as { api?: { terminal?: { write: (r: unknown) => Promise<void> } } }).api?.terminal
              if (apiInner) void apiInner.write({ id: termId, data: output })
            }
          }
        } catch {}
      }

      // Input: clicks/selección + teclado -> PTY (no al buffer del editor)
      // Usamos wireInnertaInput para mouse/wheel/focus, pero interceptamos teclado para mandarlo al PTY
      // skipKeyboard: no procesar teclado por WASM/GLFW (PTY handler lo maneja)
      const inputHandle = wireInnertaInput(canvas, () => view.module as unknown as import('@features/editor/engines/innerta/InnertaEngine').InnertaModule, { skipKeyboard: true })

      // After mouse events: flush vterm output to PTY (mouse protocol).
      // Se flushea en down/move/up/wheel — no solo en up: durante un drag en
      // vim/less (visual select) vterm genera output por cada evento y el
      // buffer de 4KB se llenaba → clicks que "no servían".
      const onPointerUpFlush = (): void => { flushVtermOutput() }
      const onPointerDownFlush = (): void => { flushVtermOutput() }
      const onPointerMoveFlush = (): void => { flushVtermOutput() }
      const onWheelFlush = (): void => { flushVtermOutput() }
      canvas.addEventListener('pointerdown', onPointerDownFlush)
      canvas.addEventListener('pointermove', onPointerMoveFlush)
      canvas.addEventListener('pointerup', onPointerUpFlush)
      canvas.addEventListener('wheel', onWheelFlush)

      // Sobrescribir keydown para que no inserte en el buffer sino que vaya al PTY
      const onKeyDownPty = (e: KeyboardEvent): void => {
        const apiInner = (window as unknown as { api?: { terminal?: { write: (r: unknown) => Promise<void> } } }).api?.terminal
        if (!apiInner) return
        // Mapeo mínimo VT: Enter -> \r, Backspace -> \x7f, Tab -> \t, Escape -> \x1b, Arrows -> ESC[A etc.
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
          // Ctrl+Shift+C: copy selection to clipboard
          e.preventDefault()
          e.stopPropagation()
          try {
            const mod = view.module as unknown as Record<string, unknown>
            const getText = mod.terminalGetSelectionText as (() => string) | undefined
            const clearSel = mod.terminalClearSelection as (() => void) | undefined
            if (getText) {
              const text = getText()
              if (text) navigator.clipboard?.writeText(text)
              if (clearSel) clearSel()
            }
          } catch {}
          return
        }
        else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
          // Ctrl+Shift+V: paste from clipboard to PTY
          e.preventDefault()
          e.stopPropagation()
          navigator.clipboard?.readText().then((text) => {
            if (text) void apiInner?.write({ id: termId, data: text })
          })
          return
        }
        else if (e.ctrlKey && e.key.toLowerCase() === 'c') data = '\x03'
        else if (e.ctrlKey && e.key.toLowerCase() === 'd') data = '\x04'
        else if (e.ctrlKey && e.key.toLowerCase() === 'l') data = '\x0c'
        if (data !== null) {
          e.preventDefault()
          e.stopPropagation()
          void apiInner.write({ id: termId, data })
        }
      }
      canvas.addEventListener('keydown', onKeyDownPty, true)

      // PTY real via window.api.terminal (main/ipc/terminal.ts)
      const api = (window as unknown as { api?: { terminal?: {
        create: (r: unknown) => Promise<unknown>
        write: (r: unknown) => Promise<void>
        onData: (cb: (p: { id: string; data: string }) => void) => () => void
        onExit: (cb: (p: { id: string; exitCode: number }) => void) => () => void
        destroy: (r: unknown) => Promise<void>
      } } }).api?.terminal

      if (!api) {
        view.setContent('$ Innerta Terminal (sin PTY — api no disponible)\r\n')
        return
      }

      // Calcular cols/rows REALES del canvas usando getRealDims()
      const { cols: termCols, rows: termRows } = getRealDims()
      void api.create({ id: termId, shell: 'bash', cwd: undefined, cols: termCols, rows: termRows })
      // Sincronizar VtParser con las mismas dims que el PTY
      view.resize(termCols, termRows)
      unsubData = api.onData((payload) => {
        if (payload.id !== termId) return
        view.append(payload.data)
      })
      unsubExit = api.onExit((payload) => {
        if (payload.id !== termId) return
        view.append(`\r\n[exit ${payload.exitCode}]\r\n`)
      })

      // Cleanup con dispose
      const prevDispose = viewRef.current?.dispose
      viewRef.current.dispose = () => {
        canvas.removeEventListener('keydown', onKeyDownPty, true)
        canvas.removeEventListener('pointerdown', onPointerDownFlush)
        canvas.removeEventListener('pointermove', onPointerMoveFlush)
        canvas.removeEventListener('pointerup', onPointerUpFlush)
        canvas.removeEventListener('wheel', onWheelFlush)
        inputHandle.dispose()
        unsubTheme()
        resizeRo.disconnect()
        prevDispose?.call(viewRef.current)
      }
    })

    return () => {
      cancelled = true
      unsubData?.()
      unsubExit?.()
      const api = (window as unknown as { api?: { terminal?: { destroy: (r: unknown) => Promise<void> } } }).api?.terminal
      if (api) void api.destroy({ id: termId })
      if (viewRef.current) {
        viewRef.current.dispose()
      } else {
        // Vista aún cargando (StrictMode): disponer cuando resuelva.
        viewPromise?.then((view) => view.dispose()).catch(() => {})
      }
      canvas.remove()
    }
  }, [])

  return (
    <div
      ref={hostRef}
      style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--color-bg)' }}
      aria-label="Terminal Innerta"
    />
  )
}

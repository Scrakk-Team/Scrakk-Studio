import type { InnertaModule } from './InnertaEngine'

/**
 * Input del host → Innerta (WASM).
 *
 * El puerto GLFW de emscripten no entrega los eventos del canvas de forma
 * fiable, así que el canvas del editor enruta pointer/keyboard/wheel acá y se
 * empujan directo a los exports C (InnertaMouse* / InnertaKey / InnertaChar).
 * Los keycodes se convierten de `KeyboardEvent.code` (físico) a GLFW.
 */

// GLFW_KEY_* de glfw3.h
const CODE_TO_GLFW: Record<string, number> = {
  Space: 32,
  Quote: 39,
  Comma: 44,
  Minus: 45,
  Period: 46,
  Slash: 47,
  Semicolon: 59,
  Equal: 61,
  BracketLeft: 91,
  Backslash: 92,
  BracketRight: 93,
  Backquote: 96,
  Escape: 256,
  Enter: 257,
  Tab: 258,
  Backspace: 259,
  Insert: 260,
  Delete: 261,
  ArrowRight: 262,
  ArrowLeft: 263,
  ArrowDown: 264,
  ArrowUp: 265,
  PageUp: 266,
  PageDown: 267,
  Home: 268,
  End: 269,
  CapsLock: 280,
  ScrollLock: 281,
  NumLock: 282,
  PrintScreen: 283,
  Pause: 284,
  ShiftLeft: 340,
  ControlLeft: 341,
  AltLeft: 342,
  MetaLeft: 343,
  ShiftRight: 344,
  ControlRight: 345,
  AltRight: 346,
  MetaRight: 347,
  ContextMenu: 348,
  NumpadDecimal: 330,
  NumpadDivide: 331,
  NumpadMultiply: 332,
  NumpadSubtract: 333,
  NumpadAdd: 334,
  NumpadEnter: 335,
  NumpadEqual: 336
}

for (let i = 0; i < 10; i++) CODE_TO_GLFW[`Digit${i}`] = 48 + i
for (let i = 0; i < 26; i++) CODE_TO_GLFW[`Key${String.fromCharCode(65 + i)}`] = 65 + i
for (let i = 0; i < 10; i++) CODE_TO_GLFW[`Numpad${i}`] = 320 + i
for (let i = 1; i <= 25; i++) CODE_TO_GLFW[`F${i}`] = 289 + i // GLFW F1 = 290

// GLFW_MOD_*
function modsOf(e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): number {
  return (
    (e.shiftKey ? 0x01 : 0) |
    (e.ctrlKey ? 0x02 : 0) |
    (e.altKey ? 0x04 : 0) |
    (e.metaKey ? 0x08 : 0)
  )
}

// DOM button → GLFW (DOM: 0=izq, 1=medio, 2=der; GLFW: 0=izq, 1=der, 2=medio)
function buttonToGlfw(button: number): number {
  if (button === 1) return 2
  if (button === 2) return 1
  return 0
}

function offsetX(e: PointerEvent, canvas: HTMLCanvasElement): number {
  return e.clientX - canvas.getBoundingClientRect().left
}

function offsetY(e: PointerEvent, canvas: HTMLCanvasElement): number {
  return e.clientY - canvas.getBoundingClientRect().top
}

export interface InnertaInputHandle {
  dispose(): void
}

/**
 * Conecta los eventos del canvas a los exports C de input. Devuelve un handle
 * para desconectar (dispose). No-op mientras el module sea null.
 */
export function wireInnertaInput(
  canvas: HTMLCanvasElement,
  getModule: () => InnertaModule | null
): InnertaInputHandle {
  const module = (): InnertaModule | null => getModule()
  let capturedPointerId: number | null = null

  /**
   * Suelta todos los botones (blur / pointercancel / lostpointercapture).
   * Transporte fiel: el engine filtra releases redundantes por su cuenta
   * (m_mouseButtonDown), así que re-enviar de más acá es inofensivo y
   * auto-sana desincronizaciones (HMR, captura fallida).
   */
  const releaseAllButtons = (): void => {
    const m = module()
    if (m) {
      m.mouseButton(0, 0, 0)
      m.mouseButton(1, 0, 0)
      m.mouseButton(2, 0, 0)
    }
    if (capturedPointerId !== null) {
      try {
        canvas.releasePointerCapture(capturedPointerId)
      } catch {
        /* sin capture */
      }
      capturedPointerId = null
    }
  }

  const onPointerMove = (e: PointerEvent): void => {
    module()?.mouseMove(offsetX(e, canvas), offsetY(e, canvas))
  }

  const onPointerDown = (e: PointerEvent): void => {
    try {
      canvas.setPointerCapture(e.pointerId)
      capturedPointerId = e.pointerId
    } catch {
      /* pointer ya liberado */
    }
    canvas.focus()
    const m = module()
    if (m) {
      m.setFocus(true)
      m.mouseMove(offsetX(e, canvas), offsetY(e, canvas))
      m.mouseButton(buttonToGlfw(e.button), 1, modsOf(e))
    }
    e.preventDefault()
  }

  const onPointerUp = (e: PointerEvent): void => {
    const m = module()
    if (m) {
      m.mouseMove(offsetX(e, canvas), offsetY(e, canvas))
      m.mouseButton(buttonToGlfw(e.button), 0, modsOf(e))
    }
    if (capturedPointerId === e.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* sin capture */
      }
      capturedPointerId = null
    }
  }

  const onPointerCancel = (): void => {
    releaseAllButtons()
    module()?.mouseLeave()
  }

  const onLostPointerCapture = (): void => {
    releaseAllButtons()
  }

  const onPointerLeave = (): void => {
    if (capturedPointerId === null) {
      module()?.mouseLeave()
    }
  }

  const onWheel = (e: WheelEvent): void => {
    // deltaMode 0=px, 1=lines → normalizar a px y a unidades GLFW (~1 notch = 120px)
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    const pxX = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX
    // GLFW: yoffset > 0 = scroll up; el navegador entrega deltaY > 0 con el
    // wheel hacia abajo → se niega para que coincida con OnScroll.
    module()?.scroll(-pxX / 120, -px / 120)
    e.preventDefault()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    const m = module()
    if (!m) return
    const glfwKey = CODE_TO_GLFW[e.code]
    const mods = modsOf(e)

    // Ctrl+V: el engine pega desde su clipboard interno (_SetInnertaWasmClipboard),
    // así que el host precarga el texto del portapapeles del navegador antes de
    // entregar la tecla. Si la lectura falla, la tecla se entrega igual.
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      const forward = (): void => {
        const mm = module()
        if (mm && glfwKey !== undefined) mm.key(glfwKey, e.repeat ? 2 : 1, mods)
      }
      navigator.clipboard
        ?.readText()
        .then((text) => {
          const mm = module()
          if (!mm) return
          mm.setWasmClipboard?.(text)
          forward()
        })
        .catch(forward)
      return
    }

    const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
    if (isPrintable) {
      // Caracter imprimible sin modificador → char (inserta texto).
      m.char(e.key.codePointAt(0) ?? 0)
    } else if (glfwKey !== undefined) {
      // Navegación / shortcuts → key con GLFW_KEY + mods (press/repeat).
      m.key(glfwKey, e.repeat ? 2 : 1, mods)
    }
    // Evitar defaults del navegador (scroll con flechas, Tab cambia foco, etc.)
    e.preventDefault()
  }

  const onWindowBlur = (): void => {
    releaseAllButtons()
    module()?.setFocus(false)
  }

  const onCanvasFocus = (): void => {
    module()?.setFocus(true)
  }

  const onCanvasBlur = (): void => {
    releaseAllButtons()
    module()?.setFocus(false)
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('lostpointercapture', onLostPointerCapture)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('focus', onCanvasFocus)
  canvas.addEventListener('blur', onCanvasBlur)
  window.addEventListener('blur', onWindowBlur)

  return {
    dispose(): void {
      releaseAllButtons()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('lostpointercapture', onLostPointerCapture)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('focus', onCanvasFocus)
      canvas.removeEventListener('blur', onCanvasBlur)
      window.removeEventListener('blur', onWindowBlur)
    }
  }
}
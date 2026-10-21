// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Panel del color picker — la UI la hace el FRONTEND.
 *
 * Antes lo pintaba el motor (nativo) sobre el canvas del editor. Ahora el
 * motor sólo publica los literales de color y aplica el color que le pidan;
 * el panel es DOM, con el MISMO layout que el nativo (mismas medidas, mismo
 * radio, mismos cursores) para que se vea igual: SV square, barra de tono,
 * barra de alfa, preview, campo hex y los botones.
 */

import { useCallback, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import { useT } from '@core/i18n'
import {
  hsvaToRgba,
  parseHex,
  rgbaToCss,
  rgbaToHex,
  rgbaToHsva
} from './colorMath'
import { PICKER_H, PICKER_W, type Hsva, type Rgba } from './types'
import styles from './ColorPickerPanel.module.css'

export interface ColorPickerPanelProps {
  /** Color inicial (el del literal bajo el cursor). */
  color: Rgba
  /** Posición del panel en coordenadas de ventana. */
  left: number
  top: number
  /** Cambió el color (mientras se arrastra). */
  onChange: (color: Rgba) => void
  /** Confirmar: escribe el color en el buffer. */
  onApply: (color: Rgba) => void
  /** Cancelar / cerrar. */
  onCancel: () => void
}

export function ColorPickerPanel({
  color,
  left,
  top,
  onChange,
  onApply,
  onCancel
}: ColorPickerPanelProps): JSX.Element {
  const t = useT()
  const [hsva, setHsva] = useState<Hsva>(() => rgbaToHsva(color))
  const [hex, setHex] = useState<string>(() => rgbaToHex(color))
  const svRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)
  const alphaRef = useRef<HTMLDivElement | null>(null)

  const commit = useCallback(
    (next: Hsva): void => {
      setHsva(next)
      const rgba = hsvaToRgba(next)
      setHex(rgbaToHex(rgba))
      onChange(rgba)
    },
    [onChange]
  )

  const onSvPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const apply = (clientX: number, clientY: number): void => {
      const rect = svRef.current?.getBoundingClientRect()
      if (!rect) return
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
      commit({ ...hsva, s, v })
    }
    apply(event.clientX, event.clientY)
    const move = (e: PointerEvent): void => apply(e.clientX, e.clientY)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onHuePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const apply = (clientY: number): void => {
      const rect = hueRef.current?.getBoundingClientRect()
      if (!rect) return
      const h = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) * 360
      commit({ ...hsva, h })
    }
    apply(event.clientY)
    const move = (e: PointerEvent): void => apply(e.clientY)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onAlphaPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const apply = (clientX: number): void => {
      const rect = alphaRef.current?.getBoundingClientRect()
      if (!rect) return
      const a = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      commit({ ...hsva, a })
    }
    apply(event.clientX)
    const move = (e: PointerEvent): void => apply(e.clientX)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const rgba = hsvaToRgba(hsva)
  const hueColor = `hsl(${hsva.h}, 100%, 50%)`

  return (
    <div
      className={styles.panel}
      style={{ left, top, width: PICKER_W, height: PICKER_H }}
      role="dialog"
      aria-label={t('features.colorpicker.titulo')}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {/* SV: saturación horizontal, valor vertical (arriba = V full) */}
      <div
        ref={svRef}
        className={styles.sv}
        style={{ ['--hue' as string]: hueColor }}
        onPointerDown={onSvPointerDown}
      >
        <div
          className={styles.svCursor}
          style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%` }}
        >
          <span className={styles.svCursorCore} style={{ background: rgbaToCss(rgba) }} />
        </div>
      </div>

      {/* Tono */}
      <div ref={hueRef} className={styles.hue} onPointerDown={onHuePointerDown}>
        <div className={styles.hueCursor} style={{ top: `${(hsva.h / 360) * 100}%` }} />
      </div>

      {/* Alfa */}
      <div
        ref={alphaRef}
        className={styles.alpha}
        style={{ ['--color' as string]: rgbaToCss({ ...rgba, a: 1 }) }}
        onPointerDown={onAlphaPointerDown}
      >
        <div className={styles.alphaCursor} style={{ left: `${hsva.a * 100}%` }} />
      </div>

      {/* Preview + hex */}
      <div className={styles.previewRow}>
        <div className={styles.previewSwatch} style={{ background: rgbaToCss(rgba) }} />
        <span className={styles.hexLabel}>{hex}</span>
      </div>

      {/* Campo hex editable */}
      <input
        className={styles.hexField}
        value={hex}
        spellCheck={false}
        onChange={(event) => {
          const value = event.target.value
          setHex(value)
          const parsed = parseHex(value)
          if (parsed) {
            const next = rgbaToHsva(parsed)
            setHsva(next)
            onChange(parsed)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onApply(rgba)
          if (event.key === 'Escape') onCancel()
        }}
      />

      {/* Botones */}
      <div className={styles.buttons}>
        <button type="button" className={styles.button} onClick={onCancel}>
          {t('features.colorpicker.cancelar')}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => onApply(rgba)}
        >
          {t('features.colorpicker.aplicar')}
        </button>
      </div>
    </div>
  )
}

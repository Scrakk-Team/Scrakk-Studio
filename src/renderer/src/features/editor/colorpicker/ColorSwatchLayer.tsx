// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Capa de color del editor — el frontend dibuja los cuadraditos y el picker.
 *
 * El motor (Innerta) publicaba antes el cuadradito de color al lado del
 * literal Y pintaba el panel del picker sobre su canvas. Ahora el motor sólo
 * publica dónde está cada literal de color (`app-color-tokens`) y el frontend
 * pone la piel encima: el cuadradito (igual que el nativo) y el panel.
 */

import { useEffect, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { getOrCreatePaneEngine } from '../engine'
import { ColorPickerPanel } from './ColorPickerPanel'
import {
  COLOR_TOKENS_EVENT,
  parseColorTokens,
  type ColorTokenInfo,
  type Rgba
} from './types'
import styles from './ColorSwatchLayer.module.css'

export interface ColorTokensDetail {
  /** Path del archivo activo en el motor que publica. */
  path: string
  /** JSON con los tokens (ver `parseColorTokens`). */
  json: string
}

interface OpenPicker {
  token: ColorTokenInfo
  /** Posición del click (coords de ventana) → dónde se abre el panel. */
  x: number
  y: number
  color: Rgba
}

export interface ColorSwatchLayerProps {
  /** Path del archivo de esta tab (el motor publica por path). */
  filePath: string
  /** Panel (strip) donde vive el motor de este archivo. */
  paneId: string
}

export function ColorSwatchLayer({ filePath, paneId }: ColorSwatchLayerProps): JSX.Element {
  const [tokens, setTokens] = useState<ColorTokenInfo[]>([])
  const [picker, setPicker] = useState<OpenPicker | null>(null)

  // Tokens que publica el motor.
  useEffect(() => {
    const onTokens = (event: Event): void => {
      const detail = (event as CustomEvent<ColorTokensDetail>).detail
      if (!detail || detail.path !== filePath) return
      setTokens(parseColorTokens(detail.json))
    }
    window.addEventListener(COLOR_TOKENS_EVENT, onTokens)
    return () => window.removeEventListener(COLOR_TOKENS_EVENT, onTokens)
  }, [filePath])

  // Click fuera del panel → cerrar.
  useEffect(() => {
    if (!picker) return
    const onDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-color-picker]')) return
      setPicker(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [picker])

  // Escape → cerrar.
  useEffect(() => {
    if (!picker) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPicker(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picker])

  const openPicker = (event: ReactPointerEvent<HTMLDivElement>, token: ColorTokenInfo): void => {
    event.preventDefault()
    event.stopPropagation()
    setPicker({
      token,
      x: event.clientX,
      y: event.clientY,
      color: { r: token.r, g: token.g, b: token.b, a: token.a }
    })
  }

  const apply = (color: Rgba): void => {
    if (!picker) return
    const engine = getOrCreatePaneEngine(paneId)
    engine.applyColorToken?.(
      picker.token.line,
      picker.token.colStart,
      picker.token.colEnd,
      color.r,
      color.g,
      color.b,
      color.a
    )
    setPicker(null)
  }

  // El panel va al body: el editor vive dentro de un panel con overflow y el
  // panel del picker puede caer fuera de él.
  const panel = picker
    ? createPortal(
        <div data-color-picker="panel">
          <ColorPickerPanel
            color={picker.color}
            left={Math.min(picker.x + 8, window.innerWidth - 226 - 8)}
            top={Math.min(picker.y + 8, window.innerHeight - 336 - 8)}
            onChange={() => undefined}
            onApply={apply}
            onCancel={() => setPicker(null)}
          />
        </div>,
        document.body
      )
    : null

  return (
    <>
      <div className={styles.layer} aria-hidden={tokens.length === 0}>
        {tokens.map((token) => (
          <div
            key={`${token.line}:${token.colStart}:${token.colEnd}`}
            className={`${styles.swatch} ${token.a < 0.999 ? styles.swatchAlpha : ''}`}
            style={{
              left: token.x,
              top: token.y,
              width: token.w,
              height: token.h,
              ['--swatch-color' as string]: `rgba(${Math.round(token.r * 255)}, ${Math.round(
                token.g * 255
              )}, ${Math.round(token.b * 255)}, ${token.a < 0.999 ? Math.max(0.35, token.a) : 1})`
            }}
            title={token.raw}
            onPointerDown={(event) => openPicker(event, token)}
          />
        ))}
      </div>
      {panel}
    </>
  )
}

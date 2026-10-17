// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * EffectsOverlay — la capa visual de los eventos SEF.
 *
 * Siempre montado (dentro del shell de la app): no usa portales. El canvas va
 * al motor (`engine.registerCanvas`) y las capas de fog/tint/vignette/shake son
 * React/CSS leyendo el estado del singleton. Todo es `pointer-events: none`:
 * la capa NUNCA intercepta clicks ni aporta layout.
 */

import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { engine } from './engine'
import styles from './EffectsOverlay.module.css'

export function EffectsOverlay(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Re-render por suscripción: el motor avisa cuando cambia el stage.
  const [, setTick] = useState(0)

  useEffect(() => engine.subscribe(() => setTick((n) => n + 1)), [])

  useEffect(() => {
    engine.registerCanvas(canvasRef.current)
    return () => engine.registerCanvas(null)
  }, [])

  const stage = engine.getStage()
  const fade = engine.getStageFade()

  // Desvío del shake: se recalcula en cada render (el motor avisa por frame
  // mientras dura el temblor). Sin shake → sin transform.
  const shakeTransform =
    stage.shake > 0
      ? `translate(${(Math.random() * 2 - 1) * stage.shake}px, ${
          (Math.random() * 2 - 1) * stage.shake
        }px)`
      : 'translate(0, 0)'

  const fogStyle = {
    opacity: stage.fog,
    transitionDuration: `${fade.fog}ms`,
    // El color de la niebla viaja como variable CSS para el gradiente.
    '--fx-fog-color': engine.getFogTint() ?? 'var(--color-accent)'
  } as CSSProperties

  const tintStyle = {
    opacity: stage.tintAmount,
    transitionDuration: `${fade.tint}ms`,
    background: stage.tint ?? 'transparent'
  } as CSSProperties

  const vignetteStyle = {
    opacity: stage.vignette,
    transitionDuration: `${fade.vignette}ms`
  } as CSSProperties

  return (
    <div className={styles.layer} style={{ transform: shakeTransform }} aria-hidden="true">
      {/* Orden de pintado: la ATMÓSFERA abajo y las PARTÍCULAS arriba. Al revés
          (como estaba) la niebla teñía a los bichos y el flash blanco tapaba
          justo al rayo, que también es blanco: el efecto "no se veía". */}
      <div className={styles.fog} style={fogStyle} />
      <div className={styles.tint} style={tintStyle} />
      <div className={styles.vignette} style={vignetteStyle} />
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}

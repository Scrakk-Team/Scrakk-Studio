/**
 * EffortSparks — la animación "maxed" del input: un canvas de chispas que
 * suben, con energía que sube al tipear. Adaptada del PromptBar (React Bits).
 *
 * Solo se monta/activa cuando el esfuerzo está en el paso máximo. El input
 * avisa de cada tecla con `bumpEffortTyping()`.
 */

import { useEffect, useRef, type JSX } from 'react'
import { useReducedMotion } from 'motion/react'
import styles from './EffortSparks.module.css'

let energy = 0
let strokes = 0

/** Lo llama el input al tipear: sube la energía de las chispas. */
export function bumpEffortTyping(): void {
  energy = Math.min(1.6, energy + 0.22)
  strokes = Math.min(4, strokes + 1)
}

interface Particle {
  x: number
  y: number
  r: number
  vy: number
  sway: number
  phase: number
  life: number
  span: number
}

function resolveColor(value: string): string {
  if (!value.startsWith('var(')) return value
  const name = value.slice(4, value.indexOf(')')).trim()
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fb923c'
  } catch {
    return '#fb923c'
  }
}

export function EffortSparks({
  active,
  color = 'var(--color-accent)',
  boost = 1
}: {
  active: boolean
  color?: string
  boost?: number
}): JSX.Element {
  const reduce = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boostRef = useRef(boost)
  boostRef.current = boost

  useEffect(() => {
    const canvas = canvasRef.current
    if (!active || reduce || !canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const spark = resolveColor(color)
    let raf = 0
    let last = performance.now()
    let w = 0
    let h = 0
    let due = 0
    let speed = 1
    let pulse = 0
    const parts: Particle[] = []

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const spawn = (burst: boolean): void => {
      parts.push({
        x: Math.random() * w,
        y: burst ? h * (0.2 + Math.random() * 0.8) : h + 3,
        r: 0.9 + Math.random() * 1.1,
        vy: -(7 + Math.random() * 9),
        sway: (Math.random() - 0.5) * 10,
        phase: Math.random() * Math.PI * 2,
        life: burst ? Math.random() * 1.2 : 0,
        span: 2.4 + Math.random() * 2.4
      })
    }

    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const gain = boostRef.current
      energy *= Math.exp(-dt / 0.8)
      pulse *= Math.exp(-dt / 0.16)
      if (strokes > 0) {
        strokes = 0
        if (gain > 0) pulse = 1
      }
      const level = energy * gain
      speed += (1 + level * 6 - speed) * (1 - Math.exp(-dt / 0.15))
      due += dt
      while (due > 0.14) {
        due -= 0.14
        if (parts.length < 30) spawn(false)
      }
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = spark
      ctx.shadowColor = spark
      ctx.shadowBlur = 6 + level * 10 + pulse * 6
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const p = parts[i]
        p.life += dt
        if (p.life > p.span) {
          parts.splice(i, 1)
          continue
        }
        const k = p.life / p.span
        const twinkle = 0.7 + 0.3 * Math.sin((now / 160) * (1 + level) + p.phase)
        p.y += p.vy * dt * speed
        if (p.y < -4) {
          p.y = h + 3
          p.x = Math.random() * w
        }
        const edge = Math.min(1, Math.max(0, p.y / 14), Math.max(0, (h - p.y) / 14))
        ctx.globalAlpha = Math.min(1, Math.sin(k * Math.PI) * (0.9 + level * 0.25) * twinkle) * edge
        ctx.beginPath()
        ctx.arc(
          p.x + Math.sin((now / 900) * (1 + level * 0.8) + p.phase) * p.sway,
          p.y,
          p.r * twinkle * (1 + level * 0.35),
          0,
          Math.PI * 2
        )
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }

    resize()
    for (let i = 0; i < 26; i += 1) spawn(true)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      ctx.clearRect(0, 0, w, h)
    }
  }, [active, reduce, color])

  if (!active) return <></>
  return <canvas ref={canvasRef} className={styles.sparks} aria-hidden="true" />
}

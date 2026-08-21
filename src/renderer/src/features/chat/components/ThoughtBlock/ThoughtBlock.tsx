import { ChevronDownIcon } from '@proicons/react'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ThinkingState } from '../ThinkingState/ThinkingState'
import styles from './ThoughtBlock.module.css'

interface ThoughtBlockProps {
  /** Razonamiento acumulado del modelo. */
  reasoning: string
  /** true mientras el modelo sigue pensando (stream abierto). */
  thinking: boolean
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

/**
 * Bloque de razonamiento estilo "Thought": mientras piensa el header es el
 * indicador "Thinking" (orb + shimmer) dentro del propio bloque; cuando
 * termina de pensar el header muestra "Thought for Ns" con el tiempo real.
 * Viewport con auto-scroll mientras piensa y oraciones con fade-in.
 */
export function ThoughtBlock({ reasoning, thinking }: ThoughtBlockProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Contador de "Thought for Ns" mientras piensa.
  useEffect(() => {
    if (!thinking) return
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [thinking])

  // Mientras piensa, el stream queda anclado al fondo.
  useEffect(() => {
    const el = viewportRef.current
    if (el && thinking) el.scrollTop = el.scrollHeight
  }, [reasoning, thinking, expanded])

  // Abierto mientras piensa; al terminar se pliega (el usuario lo despliega).
  const isExpanded = expanded || thinking
  const sentences = useMemo(() => splitSentences(reasoning), [reasoning])

  return (
    <div className={styles.tr}>
      <button
        type="button"
        className={styles.trHeader}
        aria-expanded={isExpanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {thinking ? (
          <ThinkingState />
        ) : (
          <span className={styles.trLabel}>Thought for {seconds}s</span>
        )}
        <ChevronDownIcon size={14} className={styles.trChevron} aria-hidden="true" />
      </button>

      <div className={`${styles.trCollapsible} ${isExpanded ? '' : styles.isCollapsed}`}>
        <div className={styles.trInner}>
          <div
            ref={viewportRef}
            className={`${styles.trViewport} ${thinking ? styles.isScroll : ''}`}
          >
            <div className={styles.trStream}>
              {/* key por índice: la última oración crece en su lugar sin
                  re-animarse en cada delta del stream. */}
              {sentences.map((sentence, index) => (
                <p key={index} className={styles.trSentence}>
                  {sentence}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

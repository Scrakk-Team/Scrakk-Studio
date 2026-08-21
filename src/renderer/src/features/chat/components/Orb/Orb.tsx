import type { CSSProperties, JSX } from 'react'
import styles from './Orb.module.css'

/** La geometría está afinada para un stage de 28px; --orb-k la escala a `size`. */
const STAGE = 28

/** Tamaño renderizado por defecto: caja indicadora de 20×20. */
const SIZE = 20

/** Lattice N×N. */
const N = 3
const PITCH = 6 // separación centro-a-centro en px del stage; el punto es CSS

/**
 * Delay por celda en ms (variante S2): una banda ancha cruza el grid en la
 * diagonal. El spread es cercano a la duración de la ola, lo que hace el
 * barrido continuo — la esquina lejana reinicia cuando lo hace la cercana.
 */
function cellDelay(x: number, y: number): number {
  return ((x + y) / (2 * (N - 1))) * 1500
}

interface Cell {
  key: string
  left: number
  top: number
  delay: number
}

/** Las 9 celdas del lattice, con su posición y fase. */
function latticeCells(): Cell[] {
  const cells: Cell[] = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      cells.push({
        key: `${x},${y}`,
        left: x * PITCH,
        top: y * PITCH,
        delay: cellDelay(x, y)
      })
    }
  }
  return cells
}

export interface OrbProps {
  /** Lado renderizado en px. La geometría de 28px escala para ajustarse. */
  size?: number
  className?: string
  style?: CSSProperties
}

/** Orb de lattice 3×3 (variante S2): una ola barre el grid en diagonal. */
export function Orb({ size = SIZE, className, style }: OrbProps): JSX.Element {
  return (
    <span className={styles.root + (className ? ` ${className}` : '')} style={style}>
      <span
        className={styles.glyph}
        role="img"
        aria-label="Procesando"
        style={{ width: size, height: size, '--orb-k': size / STAGE } as CSSProperties}
      >
        <span className={styles.lattice} data-variant="S2">
          {latticeCells().map((cell) => (
            <span
              key={cell.key}
              className={styles.cell}
              style={{
                left: cell.left,
                top: cell.top,
                animationDelay: `${cell.delay}ms`
              }}
            />
          ))}
        </span>
      </span>
    </span>
  )
}

/**
 * Kit visual de los pasos — primitivas compartidas.
 *
 * Existe para que cada paso sea CORTO y consistente: la tarjeta seleccionable,
 * el chip, la tecla y la nota de vista previa viven aquí una sola vez. Un paso
 * nuevo se escribe con estas piezas y no con CSS suelto.
 *
 * Solo UI: ningún componente de aquí toca servicios.
 */

import type { JSX, ReactNode } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import styles from './kit.module.css'

/** Pila vertical con separación del sistema de espacios. */
export function Stack({ children, gap = 3 }: { children: ReactNode; gap?: 2 | 3 | 4 }): JSX.Element {
  return (
    <div className={styles.stack} style={{ gap: `var(--space-${gap})` }}>
      {children}
    </div>
  )
}

/** Grilla de tarjetas seleccionables. */
export function CardGrid({
  columns = 2,
  children
}: {
  columns?: 2 | 3
  children: ReactNode
}): JSX.Element {
  return (
    <div
      className={[styles.grid, columns === 3 ? styles.grid3 : null].filter(Boolean).join(' ')}
      role="list"
    >
      {children}
    </div>
  )
}

interface OptionCardProps {
  selected?: boolean
  /**
   * Sin `onSelect` la tarjeta es INFORMATIVA: se pinta igual pero como
   * contenedor, no como botón (no hay acción que anunciar).
   */
  onSelect?: () => void
  title: string
  description?: string
  /** Id de ProductIcon opcional (a la izquierda del título). */
  icon?: string
  /** Texto chico a la derecha del título (contador, tamaño, autor…). */
  meta?: string
  /** Chip de esquina (ej. "Recomendado"). */
  badge?: string
  children?: ReactNode
}

/**
 * Tarjeta del kit: seleccionable (botón, estado elegido = borde de acento)
 * o informativa (contenedor sin acción).
 */
export function OptionCard({
  selected = false,
  onSelect,
  title,
  description,
  icon,
  meta,
  badge,
  children
}: OptionCardProps): JSX.Element {
  const className = [
    styles.card,
    onSelect ? styles.cardClickable : null,
    onSelect && selected ? styles.cardSelected : null
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <span className={styles.cardHead}>
        {icon ? (
          <span className={styles.cardIcon}>
            <ProductIcon id={icon} size={14} aria-hidden="true" />
          </span>
        ) : null}
        <span className={styles.cardTitle}>{title}</span>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
      {description ? <span className={styles.cardDesc}>{description}</span> : null}
      {children}
    </>
  )

  if (!onSelect) {
    return (
      <div role="listitem" className={className}>
        {inner}
      </div>
    )
  }

  return (
    <button type="button" role="listitem" aria-pressed={selected} className={className} onClick={onSelect}>
      {inner}
    </button>
  )
}

/** Párrafo de entrada de un paso. */
export function Lead({ children }: { children: ReactNode }): JSX.Element {
  return <p className={styles.lead}>{children}</p>
}

/** Fila con título a la izquierda y control a la derecha. */
export function SwitchRow({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className={styles.row}>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        {description ? <span className={styles.rowDesc}>{description}</span> : null}
      </span>
      <span className={styles.rowControl}>{children}</span>
    </div>
  )
}

/** Tecla individual (Ctrl, K…). */
export function KeyCap({ children }: { children: ReactNode }): JSX.Element {
  return <kbd className={styles.key}>{children}</kbd>
}

/** Combinación de teclas: <KeyCombo keys={['Ctrl', 'K']} /> */
export function KeyCombo({ keys }: { keys: string[] }): JSX.Element {
  return (
    <span className={styles.combo}>
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className={styles.comboPart}>
          {index > 0 ? <span className={styles.comboPlus}>+</span> : null}
          <KeyCap>{key}</KeyCap>
        </span>
      ))}
    </span>
  )
}

/** Lista de atajos (acción a la izquierda, teclas a la derecha). */
export function ShortcutList({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.shortcutList}>{children}</div>
}

/** Una fila de atajo. */
export function ShortcutRow({ action, keys }: { action: string; keys: string[] }): JSX.Element {
  return (
    <div className={styles.shortcutRow}>
      <span className={styles.shortcutAction}>{action}</span>
      <KeyCombo keys={keys} />
    </div>
  )
}

/**
 * Muestras de color de un tema (acento / editor / fondo). Puramente
 * decorativo: el paso de tema las usa como vista previa de la paleta.
 */
export function Swatches({ colors }: { colors: Array<string | undefined> }): JSX.Element {
  return (
    <span className={styles.swatches} aria-hidden="true">
      {colors.map((color, index) => (
        <span
          key={index}
          className={styles.swatch}
          style={{ background: color ?? 'transparent' }}
        />
      ))}
    </span>
  )
}

/** Chip de filtro (activo = acento). */
export function Chip({
  active,
  onSelect,
  children
}: {
  active: boolean
  onSelect: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={[styles.chip, active ? styles.chipActive : null].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}

/** Fila de chips (filtros). */
export function ChipRow({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.chipRow}>{children}</div>
}

/** Campo de texto del kit (búsqueda). */
export function TextInput({
  value,
  onChange,
  placeholder,
  label
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
}): JSX.Element {
  return (
    <input
      type="text"
      className={styles.input}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** Fila de resumen: etiqueta, valor elegido y acción opcional. */
export function SummaryRow({
  label,
  value,
  actionLabel = 'Cambiar',
  onAction
}: {
  label: string
  value: string
  actionLabel?: string
  onAction?: () => void
}): JSX.Element {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue}>{value}</span>
      {onAction ? (
        <button type="button" className={styles.summaryAction} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

/** Etiqueta de bloque dentro de un paso. */
export function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
  return <p className={styles.sectionLabel}>{children}</p>
}

/**
 * Nota honesta. Se usa SIEMPRE que el paso enseña algo que todavía no se
 * aplica: la maqueta se ve, pero se dice que es maqueta.
 */
export function PreviewNote({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className={styles.note} role="note">
      <span className={styles.noteIcon}>
        <ProductIcon id="info" size={13} aria-hidden="true" />
      </span>
      <span className={styles.noteText}>{children}</span>
    </div>
  )
}

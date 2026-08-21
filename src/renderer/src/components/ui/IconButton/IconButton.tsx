import type { ComponentPropsWithoutRef, JSX, ReactNode } from 'react'
import styles from './IconButton.module.css'

type IconButtonVariant = 'neutral' | 'accent' | 'danger'
type IconButtonSize = 'sm' | 'md'
type IconButtonShape = 'circle' | 'rounded'

interface IconButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** Se usa como aria-label y tooltip nativo. */
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** 'circle' (cápsula) o 'rounded' (cuadrado con esquinas redondeadas). */
  shape?: IconButtonShape
  children: ReactNode
}

/**
 * Primitive UI — botón de ícono capsular y plano.
 * Sin glow, sin sombras: solo color de fondo que cambia en hover/active.
 */
export function IconButton({
  label,
  variant = 'neutral',
  size = 'md',
  shape = 'circle',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps): JSX.Element {
  const classes = [
    styles.iconButton,
    styles[variant],
    styles[size],
    shape === 'rounded' ? styles.rounded : null,
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  )
}

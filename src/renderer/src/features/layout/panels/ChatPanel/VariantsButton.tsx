import { useEffect, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { applyVariant, getAvailableVariants } from '@features/chat/commands/variants/logic'
import { EffortSlider } from '@features/chat/components/EffortSlider/EffortSlider'
// Mismo estilo EXACTO que el botón del selector de modelos (hover, posición,
// tipografía y chevron): el variants es su hermano al lado.
import styles from '@features/providers/components/ModelPicker/ModelPicker.module.css'
import popStyles from './VariantsButton.module.css'

interface VariantsButtonProps {
  /** Variante actual del proveedor ('' = automática). */
  variant: string
}

/**
 * Botón de variante de razonamiento, idéntico al selector de modelos.
 * Abre un menú CUSTOM: la barra slideable de esfuerzo (EffortSlider), no el
 * menú contextual de items.
 */
export function VariantsButton({ variant }: VariantsButtonProps): JSX.Element {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const open = rect !== null

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setRect(null)
    }
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popRef.current?.contains(target)) return
      setRect(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  const info = getAvailableVariants()

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Esfuerzo de pensamiento: ${variant || 'automática'}`}
        // Evita que el pointerdown cierre el menú antes del click.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          if (open) {
            setRect(null)
            return
          }
          setRect(event.currentTarget.getBoundingClientRect())
        }}
      >
        <span className={styles.buttonModel}>{variant || 'auto'}</span>
        <ProductIcon
          id="chevron-down"
          size={11}
          aria-hidden="true"
          className={open ? styles.chevronOpen : styles.chevron}
        />
      </button>

      {rect ? (
        <div
          ref={popRef}
          className={popStyles.popover}
          role="dialog"
          aria-label="Esfuerzo de pensamiento"
          style={{
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 248 - 8)),
            bottom: window.innerHeight - rect.top + 8
          }}
        >
          {!info.catalogReady ? (
            <p className={popStyles.empty}>Cargando catálogo…</p>
          ) : info.options.length === 0 ? (
            <p className={popStyles.empty}>Este modelo no declara variantes de esfuerzo</p>
          ) : (
            <EffortSlider
              steps={info.options}
              value={info.current}
              onChange={(value) => applyVariant(value)}
              onAuto={() => applyVariant('auto')}
            />
          )}
        </div>
      ) : null}
    </>
  )
}

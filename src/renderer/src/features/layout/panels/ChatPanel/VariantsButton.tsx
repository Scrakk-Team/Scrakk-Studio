import { useState, type JSX } from 'react'
import { ContextMenu, type ContextMenuItem } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import { applyVariant, getAvailableVariants } from '@features/chat/commands/variants/logic'
// Mismo estilo EXACTO que el botón del selector de modelos (hover, posición,
// tipografía y chevron): el variants es su hermano al lado.
import styles from '@features/providers/components/ModelPicker/ModelPicker.module.css'

interface VariantsButtonProps {
  /** Variante actual del proveedor ('' = automática). */
  variant: string
}

/**
 * Botón de variante de razonamiento, idéntico al selector de modelos.
 * Abre el menú contextual global con las opciones del modelo activo
 * (models.dev): "Automática" + los valores declarados.
 */
export function VariantsButton({ variant }: VariantsButtonProps): JSX.Element {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const open = anchor !== null

  const buildItems = (): ContextMenuItem[] => {
    const info = getAvailableVariants()
    if (!info.catalogReady) {
      return [{ label: 'Cargando catálogo…', disabled: true }]
    }
    if (info.options.length === 0) {
      return [{ label: 'Este modelo no declara variantes', disabled: true }]
    }
    return [
      { label: 'Automática', checked: info.current === '', onClick: () => applyVariant('auto') },
      ...info.options.map((value) => ({
        label: value,
        checked: info.current === value,
        onClick: () => applyVariant(value)
      }))
    ]
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Variante de razonamiento: ${variant || 'automática'}`}
        // Evita que el pointerdown cierre el menú antes del click.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          if (open) {
            setAnchor(null)
            return
          }
          const rect = event.currentTarget.getBoundingClientRect()
          setAnchor({ x: rect.left, y: rect.top })
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

      {anchor ? (
        <ContextMenu
          items={buildItems()}
          x={anchor.x}
          y={anchor.y}
          placement="above"
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </>
  )
}

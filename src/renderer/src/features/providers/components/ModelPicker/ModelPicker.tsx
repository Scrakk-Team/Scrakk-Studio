import { ProductIcon } from '@services/productIcons/components'
import { useEffect, useRef, useState, type JSX } from 'react'
import { useProviders } from '../../state'
import styles from './ModelPicker.module.css'

interface ModelOption {
  providerId: string
  providerName: string
  model: string
}

/**
 * Selector de modelos, vive dentro del input (a la izquierda del botón de
 * enviar). Muestra el modelo activo; el dropdown lista DIRECTAMENTE los
 * modelos (uno por proveedor añadido, el id que escribió el usuario).
 */
export function ModelPicker(): JSX.Element {
  const {
    providers,
    activeProviderId,
    getApiKey,
    getModel,
    selectProvider,
    openProvidersModal
  } = useProviders()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Un modelo por proveedor añadido (el que el usuario escribió para él).
  const modelOptions: ModelOption[] = providers
    .filter((provider) => getApiKey(provider.id) && getModel(provider.id).trim().length > 0)
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      model: getModel(provider.id)
    }))

  const activeModel = activeProviderId ? getModel(activeProviderId) : null

  // Cerrar al hacer click afuera o con Escape.
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSelect = (providerId: string): void => {
    selectProvider(providerId)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={activeModel ? `Modelo: ${activeModel}` : 'Seleccionar modelo'}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles.buttonModel}>{activeModel ?? 'Modelo'}</span>
        <ProductIcon
          id="chevron-down"
          size={11}
          aria-hidden="true"
          className={open ? styles.chevronOpen : styles.chevron}
        />
      </button>

      {open && (
        <div className={styles.dropdown}>
          {modelOptions.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>
                No hay modelos todavía. Agregá un proveedor y escribí el tuyo.
              </p>
              <button
                type="button"
                className={styles.emptyAction}
                onClick={() => {
                  setOpen(false)
                  openProvidersModal()
                }}
              >
                Abrir proveedores
              </button>
            </div>
          ) : (
            <div className={styles.list} role="listbox" aria-label="Modelos disponibles">
              {modelOptions.map((option) => {
                const isActive = option.providerId === activeProviderId
                return (
                  <button
                    key={option.providerId}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={styles.item}
                    onClick={() => handleSelect(option.providerId)}
                  >
                    <span className={styles.itemInfo}>
                      <span className={styles.itemModel}>{option.model}</span>
                      <span className={styles.itemProvider}>{option.providerName}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

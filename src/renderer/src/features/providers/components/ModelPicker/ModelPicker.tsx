// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ProductIcon } from '@services/productIcons/components'
import { useRef, useState, type JSX } from 'react'
import { ContextMenu, type ContextMenuItem } from '@ui'
import { useProviders } from '../../state'
import styles from './ModelPicker.module.css'

interface ModelOption {
  providerId: string
  providerName: string
  model: string
}

/**
 * Items del menú de modelos (compartidos con el footer responsive, que los
 * muestra dentro del botón de 3 puntos cuando el panel es angosto).
 */
export function useModelMenuItems(): ContextMenuItem[] {
  const {
    providers,
    activeProviderId,
    getApiKey,
    getModel,
    selectProvider,
    openProvidersModal
  } = useProviders()

  const modelOptions: ModelOption[] = providers
    .filter((provider) => getApiKey(provider.id) && getModel(provider.id).trim().length > 0)
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      model: getModel(provider.id)
    }))

  if (modelOptions.length === 0) {
    return [
      { label: 'No hay modelos todavía', disabled: true },
      {
        label: 'Abrir proveedores',
        icon: <ProductIcon id="server" size={13} aria-hidden="true" />,
        onClick: () => openProvidersModal()
      }
    ]
  }

  return modelOptions.map((option) => ({
    label: option.model,
    sublabel: option.providerName,
    checked: option.providerId === activeProviderId,
    onClick: () => selectProvider(option.providerId)
  }))
}

/**
 * Selector de modelos, vive dentro del input (a la izquierda del botón de
 * enviar). Muestra el modelo activo y abre el MISMO menú contextual global
 * (@ui/ContextMenu), no un dropdown propio: misma pinta y mismo
 * comportamiento que el resto de los menús de la app.
 */
export function ModelPicker(): JSX.Element {
  const { activeProviderId, getModel } = useProviders()
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const items = useModelMenuItems()

  const activeModel = activeProviderId ? getModel(activeProviderId) : null
  const open = anchor !== null

  const openMenu = (): void => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor({ x: rect.left, y: rect.top })
  }

  return (
    <div className={styles.root}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-haspopup="menu"
        title={activeModel ? `Modelo: ${activeModel}` : 'Seleccionar modelo'}
        // Evita que el pointerdown cierre el menú antes del click (si no,
        // el toggle reabriría y el botón nunca cerraría).
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => (open ? setAnchor(null) : openMenu())}
      >
        <span className={styles.buttonModel}>{activeModel ?? 'Modelo'}</span>
        <ProductIcon
          id="chevron-down"
          size={11}
          aria-hidden="true"
          className={open ? styles.chevronOpen : styles.chevron}
        />
      </button>

      {anchor ? (
        <ContextMenu
          items={items}
          x={anchor.x}
          y={anchor.y}
          placement="above"
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </div>
  )
}

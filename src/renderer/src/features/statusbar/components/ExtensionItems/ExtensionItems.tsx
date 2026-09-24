// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Items de barra de estado aportados por extensiones.
 *
 * Se MEZCLAN con los chips propios del IDE (no hay una barra aparte para
 * extensiones, igual que en VS Code): la izquierda a la izquierda, la derecha a
 * la derecha, ordenados por prioridad descendente.
 *
 * Una extensión como Cline crea su item al activar; si no se pinta, la
 * extensión cree que el IDE le aceptó algo que nadie ve.
 */

import { useEffect, useState, type JSX } from 'react'
import { extensionStatusBar } from '@services/extensions/statusBar'
import { ProductIcon } from '@services/productIcons/components'
import type { StatusBarItemModel } from '@shared/extensionHost/protocol'
import styles from './ExtensionItems.module.css'

export function ExtensionItems({ alignment }: { alignment: 'left' | 'right' }): JSX.Element | null {
  const [items, setItems] = useState<StatusBarItemModel[]>(() =>
    extensionStatusBar.list(alignment)
  )

  useEffect(() => extensionStatusBar.subscribe(() => setItems(extensionStatusBar.list(alignment))), [
    alignment
  ])

  if (items.length === 0) return null

  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.item}
          data-ext-id={item.extensionId}
          title={item.tooltip ?? item.name ?? item.text}
          aria-label={`${item.name ?? (item.text || item.extensionId)} (extensión)`}
          disabled={!item.command}
          onClick={() => void extensionStatusBar.activate(item.id)}
        >
          {item.icon ? <ProductIcon id={item.icon} size={14} /> : null}
          {item.text ? <span className={styles.text}>{item.text}</span> : null}
        </button>
      ))}
    </>
  )
}

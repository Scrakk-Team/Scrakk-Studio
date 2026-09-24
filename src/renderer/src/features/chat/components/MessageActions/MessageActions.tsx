// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ProductIcon } from '@services/productIcons/components'
import { useEffect, useRef, useState, type JSX } from 'react'
import styles from './MessageActions.module.css'

interface MessageActionsProps {
  /** Contenido del mensaje a copiar. */
  content: string
  /** Si viene, se muestra el botón "Regenerar" (última respuesta de la IA). */
  onRegenerate?: () => void
}

/**
 * Barra de acciones debajo de los mensajes de la IA: copiar y regenerar.
 * Botones planos, chicos, sin fondo hasta el hover, alineados a la izquierda.
 */
export function MessageActions({ content, onRegenerate }: MessageActionsProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Si el componente se desmonta antes de los 1.2s, no actualizar estado muerto.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(content)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.button}
        onClick={handleCopy}
        aria-label={copied ? 'Copiado' : 'Copiar mensaje'}
        title={copied ? 'Copiado' : 'Copiar'}
      >
        {copied ? (
          <ProductIcon id="check" size={14} className={styles.iconCopied} aria-hidden="true" />
        ) : (
          <ProductIcon id="copy" size={14} className={styles.icon} aria-hidden="true" />
        )}
      </button>

      {onRegenerate ? (
        <button
          type="button"
          className={styles.button}
          onClick={onRegenerate}
          aria-label="Regenerar respuesta"
          title="Regenerar"
        >
          <ProductIcon id="refresh" size={14} className={styles.icon} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

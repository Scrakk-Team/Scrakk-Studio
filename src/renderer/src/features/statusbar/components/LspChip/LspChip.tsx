// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LspChip — indicador + trigger de la zona LSP (Ajustes → Servidores).
 *
 * Bloque full-bleed pegado al borde izquierdo con el mismo color de la
 * statusbar (sin fondo accent, sin hover). El dot de estado usa colores
 * fijos por estado (idle/ready/starting/retrying/failed).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import {
  aggregateServerState,
  lspStatus,
  onLspServerEvent,
  type AggregateLspState
} from '@services/lsp'
import { openSettingsModal } from '@features/settings'
import styles from './LspChip.module.css'

export function LspChip(): JSX.Element {
  const [aggregate, setAggregate] = useState<AggregateLspState>({
    state: 'idle',
    counts: {},
    total: 0
  })

  const refresh = useCallback(async (): Promise<void> => {
    setAggregate(aggregateServerState(await lspStatus()))
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = onLspServerEvent(() => void refresh())
    return () => {
      unsub()
    }
  }, [refresh])

  const title =
    aggregate.total === 0
      ? 'Language Servers: ninguno registrado'
      : `Language Servers: ${aggregate.total} · ${aggregate.state}` +
        ((aggregate.counts['failed'] ?? 0) > 0
          ? ` (${aggregate.counts['failed']} con error)`
          : '')

  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => openSettingsModal('servers')}
      title={title}
      aria-label="Estado de language servers"
    >
      <span
        className={[styles.dot, styles[`dot_${aggregate.state}`] ?? null]
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      />
      <ProductIcon id="server" size={12} />
      {aggregate.total > 0 ? <span className={styles.count}>{aggregate.counts['ready'] ?? 0}</span> : null}
    </button>
  )
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { IconButton } from '@ui'
import type { AccountList } from '@shared/account'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import styles from './AccountSwitcher.module.css'

interface AccountSwitcherProps {
  accounts: AccountList
  /** Cuenta que usa ESTE panel (no la global). */
  activeId: string | null
  onSwitch: (accountId: string) => void
  onRemove: (accountId: string) => Promise<{ ok: boolean; error?: string }>
  /** Sumar otra cuenta (abre el flujo email + código). */
  onAdd: () => void
  onClose: () => void
}

/**
 * Cambiador de cuentas: lista las guardadas, marca la que usa este panel y
 * permite cambiar en caliente, quitar o sumar otra. Cada panel elige la suya.
 */
export function AccountSwitcher({
  accounts,
  activeId,
  onSwitch,
  onRemove,
  onAdd,
  onClose
}: AccountSwitcherProps): JSX.Element {
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleSwitch = (id: string): void => {
    if (id === activeId) return
    onSwitch(id)
  }

  const handleRemove = async (id: string): Promise<void> => {
    setBusyId(id)
    await onRemove(id)
    setBusyId(null)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <IconButton label="Volver" size="sm" shape="rounded" onClick={onClose}>
          <ProductIcon id="chevron-right" size={15} style={{ transform: 'rotate(180deg)' }} />
        </IconButton>
        <span className={styles.title}>Cuentas</span>
      </div>

      <div className={styles.list}>
        {accounts.accounts.length === 0 ? (
          <p className={styles.empty}>No hay cuentas guardadas.</p>
        ) : (
          accounts.accounts.map((account) => {
            const active = account.id === activeId
            const label = account.displayName ?? account.handle ?? account.email
            return (
              <div
                key={account.id}
                className={[styles.row, active ? styles.rowActive : null].filter(Boolean).join(' ')}
              >
                <button
                  type="button"
                  className={styles.rowMain}
                  disabled={busyId !== null}
                  onClick={() => handleSwitch(account.id)}
                >
                  <UserAvatar name={label} src={account.avatarUrl ?? undefined} size={32} />
                  <span className={styles.info}>
                    <span className={styles.name}>{label}</span>
                    <span className={styles.email}>{account.email}</span>
                  </span>
                  {active ? <span className={styles.badge}>ACTIVA</span> : null}
                </button>
                <IconButton
                  label="Quitar cuenta"
                  size="sm"
                  shape="rounded"
                  disabled={busyId !== null}
                  onClick={() => void handleRemove(account.id)}
                >
                  <ProductIcon id="trash" size={14} />
                </IconButton>
              </div>
            )
          })
        )}
      </div>

      <button type="button" className={styles.add} onClick={onAdd}>
        <ProductIcon id="person-add" size={15} />
        Agregar cuenta
      </button>
    </div>
  )
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import type { FriendRequest } from '@shared/social'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import { VerifiedCheck } from '../VerifiedCheck/VerifiedCheck'
import styles from './RequestsList.module.css'

import { t } from '@core/i18n'
interface RequestsListProps {
  requests: FriendRequest[]
  onRespond: (requestId: string, accept: boolean) => Promise<{ ok: boolean; error?: string }>
}

/** Solicitudes de amistad pendientes: entrantes (aceptar/rechazar) y salientes. */
export function RequestsList({ requests, onRespond }: RequestsListProps): JSX.Element | null {
  const [busyId, setBusyId] = useState<string | null>(null)

  if (requests.length === 0) return null

  const respond = async (id: string, accept: boolean): Promise<void> => {
    setBusyId(id)
    await onRespond(id, accept)
    setBusyId(null)
  }

  return (
    <div className={styles.list}>
      {requests.map((request) => {
        const label = request.displayName ?? request.handle ?? t('social.usuario')
        const incoming = request.direction === 'incoming'
        return (
          <div key={request.id} className={styles.row}>
            <UserAvatar name={label} src={request.avatarUrl ?? undefined} size={30} />
            <span className={styles.main}>
              <span className={styles.name}>
                {label}
                {request.verified ? <VerifiedCheck /> : null}
              </span>
              <span className={styles.handle}>
                {incoming ? t('social.quiere.ser.tu.amigo') : t('social.solicitud.enviada')}
              </span>
            </span>
            {incoming ? (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.accept}
                  disabled={busyId === request.id}
                  onClick={() => void respond(request.id, true)}
                  title={t('social.aceptar')}
                >
                  <ProductIcon id="check" size={13} />
                </button>
                <button
                  type="button"
                  className={styles.reject}
                  disabled={busyId === request.id}
                  onClick={() => void respond(request.id, false)}
                  title={t('social.rechazar')}
                >
                  <ProductIcon id="close" size={13} />
                </button>
              </div>
            ) : (
              <span className={styles.pending}>pendiente</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

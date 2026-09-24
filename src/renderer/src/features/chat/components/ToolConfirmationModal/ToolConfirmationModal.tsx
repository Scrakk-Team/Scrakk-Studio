// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Confirmación de tool calls.
 *
 * Se suscribe al ConfirmationBus y muestra la confirmación como panel anclado
 * ARRIBA del input de chat (igual que el autocompletado de comandos), sin el
 * JSON de argumentos: motivo, riesgo y detalles cortos. Si no hay input
 * montado, cae al modal centrado de siempre.
 */

import { useEffect, type JSX } from 'react'
import { showAnchoredModal, showModal } from '@services/modals'
import {
  confirmationBus,
  type ConfirmationRequest,
  type ConfirmationResponse
} from '@services/ai/policy/confirmation-bus'
import { policyEngine } from '@services/ai/policy'
import { toolSettingsService } from '@services/ai/toolSettings'
import { getChatInputAnchor } from '../ChatInput/inputAnchor'
import styles from './ToolConfirmationModal.module.css'

function applyAlwaysApprove(): void {
  toolSettingsService.setApprovalMode('all_allow')
  policyEngine.setModeId('all_allow')
  // El glow del input refleja el color del modo.
  window.dispatchEvent(new CustomEvent('approval-mode-changed', { detail: { mode: 'all_allow' } }))
}

function ConfirmationCard({
  request,
  onRespond
}: {
  request: ConfirmationRequest
  onRespond: (response: ConfirmationResponse) => void
}): JSX.Element {
  const risk = request.riskLevel ?? 'unknown'
  return (
    <div className={styles.body}>
      <div className={[styles.risk, styles[risk]].join(' ')}>Riesgo: {risk}</div>
      <p className={styles.reason}>{request.reason}</p>
      {request.detail ? <p className={styles.detail}>{request.detail}</p> : null}

      {request.details && request.details.length > 0 ? (
        <ul className={styles.list}>
          {request.details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.always}
          onClick={() => onRespond('approved_always')}
        >
          Siempre aprobar
        </button>
        <button type="button" className={styles.reject} onClick={() => onRespond('rejected')}>
          Rechazar
        </button>
        <button type="button" className={styles.approve} onClick={() => onRespond('approved')} autoFocus>
          Aprobar
        </button>
      </div>
    </div>
  )
}

export function ToolConfirmationModal(): JSX.Element | null {
  useEffect(() => {
    return confirmationBus.subscribe((request) => {
      const respond = (response: ConfirmationResponse): void => {
        if (response === 'approved_always') applyAlwaysApprove()
        confirmationBus.resolve(request.id, response)
      }
      const render = ({ close }: { close: () => void }): JSX.Element => (
        <ConfirmationCard
          request={request}
          onRespond={(response) => {
            respond(response)
            close()
          }}
        />
      )
      // Cerrar por Esc/click afuera también rechaza (no deja al agente colgado).
      const onClose = (): void => respond('rejected')

      const anchor = getChatInputAnchor()
      if (anchor) {
        showAnchoredModal({
          key: `tool-confirm:${request.id}`,
          title: 'Confirmar acción',
          anchor: { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height },
          placement: 'above',
          align: 'center',
          width: 360,
          render,
          onClose
        })
      } else {
        showModal({ title: 'Confirmar acción', size: 'sm', render, onClose })
      }
    })
  }, [])

  // El estado vive en el servicio de modales: este componente solo suscribe.
  return null
}

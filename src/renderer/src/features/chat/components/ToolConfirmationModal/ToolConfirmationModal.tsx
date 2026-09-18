/**
 * Modal de confirmación de tool calls (patrón de Scrakk Code Editor).
 *
 * Se suscribe al ConfirmationBus: cuando el policy engine pide aprobación
 * para una tool (mutaciones, comandos de riesgo), muestra el modal con el
 * motivo y el detalle. Aprobar/Rechazar responden la llamada; "Siempre"
 * además pasa el policy engine a modo all_allow.
 */

import { useEffect, useState, type JSX } from 'react'
import { Modal } from '@ui'
import {
  confirmationBus,
  type ConfirmationRequest
} from '@services/ai/policy/confirmation-bus'
import { policyEngine } from '@services/ai/policy'
import { toolSettingsService } from '@services/ai/toolSettings'
import styles from './ToolConfirmationModal.module.css'

export function ToolConfirmationModal(): JSX.Element | null {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null)

  useEffect(() => {
    return confirmationBus.subscribe((next) => setRequest(next))
  }, [])

  if (!request) return null

  const respond = (response: 'approved' | 'rejected' | 'approved_always'): void => {
    const id = request.id
    setRequest(null)
    if (response === 'approved_always') {
      toolSettingsService.setApprovalMode('all_allow')
      policyEngine.setModeId('all_allow')
      // El glow del input refleja el color del modo.
      window.dispatchEvent(new CustomEvent('approval-mode-changed', { detail: { mode: 'all_allow' } }))
    }
    confirmationBus.resolve(id, response)
  }

  const risk = request.riskLevel ?? 'unknown'

  return (
    <Modal open onClose={() => respond('rejected')} title="Confirmar acción">
      <div className={styles.body}>
        <div className={[styles.risk, styles[risk]].join(' ')}>
          Riesgo: {risk}
        </div>
        <p className={styles.reason}>{request.reason}</p>
        <p className={styles.detail}>{request.detail}</p>

        {request.details && request.details.length > 0 ? (
          <ul className={styles.list}>
            {request.details.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
        ) : null}

        {request.toolArgs && Object.keys(request.toolArgs).length > 0 ? (
          <pre className={styles.args}>{JSON.stringify(request.toolArgs, null, 2)}</pre>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.always}
            onClick={() => respond('approved_always')}
          >
            Siempre aprobar
          </button>
          <button type="button" className={styles.reject} onClick={() => respond('rejected')}>
            Rechazar
          </button>
          <button
            type="button"
            className={styles.approve}
            onClick={() => respond('approved')}
            autoFocus
          >
            Aprobar
          </button>
        </div>
      </div>
    </Modal>
  )
}

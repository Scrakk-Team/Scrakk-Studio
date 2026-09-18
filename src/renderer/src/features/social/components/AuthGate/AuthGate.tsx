import type { JSX } from 'react'
import { EmailCodeForm } from '../EmailCodeForm/EmailCodeForm'
import styles from './AuthGate.module.css'

interface AuthGateProps {
  /** Pide el código OTP para el email. */
  onRequestCode: (email: string) => Promise<{ ok: boolean; error?: string }>
  /** Verifica el código y abre sesión. */
  onVerifyCode: (email: string, code: string) => Promise<{ ok: boolean; error?: string }>
  /** Si viene, muestra "Cancelar" (flujo de sumar cuenta). */
  onCancel?: () => void
}

/**
 * Puerta de entrada del panel Social cuando no hay sesión: un solo flujo
 * (email → código) que sirve para crear cuenta o entrar, igual que el CLI.
 * Con `onCancel` se usa también para SUMAR otra cuenta estando logueado.
 */
export function AuthGate({ onRequestCode, onVerifyCode, onCancel }: AuthGateProps): JSX.Element {
  return (
    <div className={styles.wrap}>
      <EmailCodeForm onRequestCode={onRequestCode} onVerifyCode={onVerifyCode} />
      {onCancel ? (
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancelar
        </button>
      ) : null}
    </div>
  )
}

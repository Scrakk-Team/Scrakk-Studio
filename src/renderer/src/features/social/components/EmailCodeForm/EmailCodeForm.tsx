import { useState, type ChangeEvent, type FormEvent, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { ACCOUNT_RULES } from '@shared/account'
import styles from './EmailCodeForm.module.css'

interface EmailCodeFormProps {
  /** Pide el código (dispara el email por la API del CLI/Resend). */
  onRequestCode: (email: string) => Promise<{ ok: boolean; error?: string }>
  /** Verifica el código y abre sesión. */
  onVerifyCode: (email: string, code: string) => Promise<{ ok: boolean; error?: string }>
}

/**
 * Ingreso por email + código OTP — el MISMO método que el CLI. Un solo flujo
 * sirve para cuentas nuevas y existentes: pedís el código, lo escribís, entrás.
 */
export function EmailCodeForm({ onRequestCode, onVerifyCode }: EmailCodeFormProps): JSX.Element {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailValid = ACCOUNT_RULES.email.test(email.trim())

  const submitEmail = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!emailValid || busy) return
    setBusy(true)
    setError(null)
    const result = await onRequestCode(email.trim())
    setBusy(false)
    if (result.ok) setStep('code')
    else setError(result.error ?? 'No se pudo enviar el código')
  }

  const submitCode = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!ACCOUNT_RULES.code.test(code) || busy) return
    setBusy(true)
    setError(null)
    const result = await onVerifyCode(email.trim(), code)
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Código inválido o expirado')
  }

  if (step === 'email') {
    return (
      <form className={styles.form} onSubmit={submitEmail}>
        <div className={styles.head}>
          <ProductIcon id="person" size={18} className={styles.headIcon} />
          <div className={styles.headText}>
            <span className={styles.title}>Entra o crea tu cuenta</span>
            <span className={styles.subtitle}>
              Te mandamos un código al email. La misma cuenta sirve para el IDE y el CLI.
            </span>
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
            placeholder="tu@ejemplo.com"
            autoComplete="email"
            spellCheck={false}
            autoFocus
          />
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button type="submit" className={styles.primaryBtn} disabled={!emailValid || busy}>
          <ProductIcon id={busy ? 'refresh' : 'arrow-right'} size={14} />
          {busy ? 'Enviando…' : 'Enviar código'}
        </button>
      </form>
    )
  }

  return (
    <form className={styles.form} onSubmit={submitCode}>
      <div className={styles.head}>
        <ProductIcon id="key" size={18} className={styles.headIcon} />
        <div className={styles.headText}>
          <span className={styles.title}>Escribe el código</span>
          <span className={styles.subtitle}>
            Te mandamos un código de 6 dígitos a <strong>{email.trim()}</strong>.
          </span>
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Código</span>
        <input
          className={styles.codeInput}
          value={code}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
        />
      </label>

      {error ? <p className={styles.error}>{error}</p> : null}

      <button type="submit" className={styles.primaryBtn} disabled={!ACCOUNT_RULES.code.test(code) || busy}>
        <ProductIcon id={busy ? 'refresh' : 'check'} size={14} />
        {busy ? 'Verificando…' : 'Entrar'}
      </button>

      <div className={styles.footerLinks}>
        <button type="button" className={styles.linkBtn} onClick={() => { setStep('email'); setCode(''); setError(null) }}>
          Cambiar email
        </button>
        <button
          type="button"
          className={styles.linkBtn}
          disabled={busy}
          onClick={() => void onRequestCode(email.trim())}
        >
          Reenviar código
        </button>
      </div>
    </form>
  )
}

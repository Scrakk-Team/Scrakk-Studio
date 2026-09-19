import { useState, type ChangeEvent, type FormEvent, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { ACCOUNT_RULES } from '@shared/account'
import { AvatarPicker } from '../AvatarPicker/AvatarPicker'
import styles from './ProfileEditor.module.css'

/** Datos de perfil que el editor entrega al confirmar. */
export interface ProfileDraft {
  name: string
  handle: string
  description: string
  avatarUrl: string
  gender?: string | null
  customStatus?: string | null
  customStatusEmoji?: string | null
  customStatusDuration?: string | null
}

export interface ProfileEditorSubmitResult {
  ok: boolean
  error?: string
}

interface ProfileEditorProps {
  /** Valores iniciales (edición / setup). */
  initial?: Partial<ProfileDraft>
  /** DNI ya emitido (se muestra en edición). */
  dni?: string
  mode?: 'setup' | 'edit'
  /** Cuenta que sube el avatar (para guardar en Storage). */
  accountId?: string | null
  onSubmit: (draft: ProfileDraft) => Promise<ProfileEditorSubmitResult>
  onCancel?: () => void
}

/**
 * Perfil del usuario.
 *
 * - `setup`: primer ingreso tras verificar el código (crea tu perfil público).
 *   Si no se completa, el alta queda a medias.
 * - `edit`: edición del perfil existente.
 *
 * La foto es un enlace o un archivo re-escalado (data URL): nunca se sube un
 * binario a un servidor.
 */
export function ProfileEditor({
  initial,
  dni,
  mode = 'setup',
  accountId,
  onSubmit,
  onCancel
}: ProfileEditorProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [handle, setHandle] = useState(initial?.handle ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? '')
  const [gender, setGender] = useState(initial?.gender ?? '')
  const [customStatus, setCustomStatus] = useState(initial?.customStatus ?? '')
  const [customDuration, setCustomDuration] = useState(initial?.customStatusDuration ?? '4h')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSetup = mode === 'setup'
  const canSubmit = !submitting && name.trim().length > 0

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    let expiresAt: string | null = null
    if (customStatus.trim() && customDuration !== 'never') {
      const now = Date.now()
      const map: Record<string, number> = { '30m': 30 * 60_000, '1h': 60 * 60_000, '4h': 4 * 60 * 60_000, '1d': 24 * 60 * 60_000 }
      const ms = map[customDuration] ?? 4 * 60 * 60_000
      expiresAt = new Date(now + ms).toISOString()
    }
    const result = await onSubmit({
      name: name.trim(),
      handle: handle.trim(),
      description: description.trim(),
      avatarUrl: avatarUrl.trim(),
      gender: gender || null,
      customStatus: customStatus.trim() || null,
      customStatusDuration: expiresAt
    })
    setSubmitting(false)
    if (!result.ok) setError(result.error ?? 'No se pudo guardar el perfil')
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <AvatarPicker value={avatarUrl} onChange={setAvatarUrl} name={name} accountId={accountId} />

      <div className={styles.introText}>
        <span className={styles.title}>{isSetup ? 'Completa tu perfil' : 'Editar perfil'}</span>
        <span className={styles.subtitle}>
          {isSetup ? 'Ya tienes sesión. Elige cómo te verán en Scrakk.' : 'Actualiza tu perfil público.'}
        </span>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Nombre</span>
        <input
          className={styles.input}
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          placeholder="Tu nombre"
          maxLength={ACCOUNT_RULES.displayNameMax}
          autoFocus
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Usuario</span>
        <div className={styles.inputWithPrefix}>
          <span className={styles.prefix}>@</span>
          <input
            className={styles.inputBare}
            value={handle.replace(/^@/, '')}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setHandle(event.target.value)}
            placeholder="usuario"
            maxLength={24}
            spellCheck={false}
          />
        </div>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Descripción</span>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
          placeholder="Cuenta algo sobre ti (opcional)"
          rows={3}
          maxLength={ACCOUNT_RULES.bioMax}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Género</span>
        <button
          type="button"
          className={styles.input}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            showContextMenu(rect.left, rect.bottom + 4, [
              { label: 'Prefiero no decir', onClick: () => setGender('') },
              { label: 'Masculino', onClick: () => setGender('male') },
              { label: 'Femenino', onClick: () => setGender('female') },
              { label: 'No binario', onClick: () => setGender('nonbinary') },
              { label: 'Otro', onClick: () => setGender('other') }
            ])
          }}
        >
          <span>
            {gender === 'male'
              ? 'Masculino'
              : gender === 'female'
                ? 'Femenino'
                : gender === 'nonbinary'
                  ? 'No binario'
                  : gender === 'other'
                    ? 'Otro'
                    : 'Prefiero no decir'}
          </span>
          <ProductIcon id="chevron-down" size={14} />
        </button>
      </label>

      <div className={styles.field}>
        <span className={styles.label}>Estado personalizado</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={styles.input}
            style={{ flex: 1 }}
            value={customStatus}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setCustomStatus(event.target.value)}
            placeholder="Ej: Enfocado, Jugando..."
            maxLength={ACCOUNT_RULES.customStatusMax}
          />
          <button
            type="button"
            className={styles.input}
            style={{ width: 90, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              showContextMenu(rect.left, rect.bottom + 4, [
                { label: '30m', onClick: () => setCustomDuration('30m') },
                { label: '1h', onClick: () => setCustomDuration('1h') },
                { label: '4h', onClick: () => setCustomDuration('4h') },
                { label: '1d', onClick: () => setCustomDuration('1d') },
                { label: 'Nunca', onClick: () => setCustomDuration('never') }
              ])
            }}
          >
            <span>{customDuration}</span>
            <ProductIcon id="chevron-down" size={14} />
          </button>
        </div>
      </div>

      <div className={styles.dniRow}>
        <ProductIcon id="shield-check" size={13} className={styles.dniIcon} />
        {dni ? (
          <span className={styles.dniText}>
            DNI <span className={styles.dni}>{dni}</span>
          </span>
        ) : (
          <span className={styles.dniText}>Tu DNI es el id de tu cuenta.</span>
        )}
      </div>

      {error ? <p className={styles.formError}>{error}</p> : null}

      <div className={styles.actions}>
        {onCancel ? (
          <button type="button" className={styles.ghostBtn} onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        ) : null}
        <button type="submit" className={styles.primaryBtn} disabled={!canSubmit}>
          <ProductIcon id={submitting ? 'refresh' : 'check'} size={14} />
          {submitting ? 'Guardando…' : isSetup ? 'Empezar' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

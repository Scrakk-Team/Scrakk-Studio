import { useRef, useState, type ChangeEvent, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { ACCOUNT_RULES } from '@shared/account'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import styles from './AvatarPicker.module.css'

interface AvatarPickerProps {
  /** Enlace http(s) o data URL de la imagen. */
  value: string
  onChange: (value: string) => void
  /** Nombre para las iniciales del preview. */
  name: string
}

/**
 * Elige la foto de perfil: por enlace (http/https) o subiendo un archivo, que
 * se re-escala a 128px y se convierte en data URL (JPEG) — SIN subir nada a un
 * servidor. La foto nunca se guarda como binario en la base: es un enlace/texto.
 *
 * El re-encode por canvas además descarta EXIF y bloquea SVG/HTML malicioso.
 */
async function fileToAvatarDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bitmap = await createImageBitmap(file)
    const max = 128
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    let quality = 0.85
    let out = canvas.toDataURL('image/jpeg', quality)
    while (out.length > ACCOUNT_RULES.avatarMaxBytes && quality > 0.4) {
      quality -= 0.15
      out = canvas.toDataURL('image/jpeg', quality)
    }
    return out.length <= ACCOUNT_RULES.avatarMaxBytes ? out : null
  } catch {
    return null
  }
}

export function AvatarPicker({ value, onChange, name }: AvatarPickerProps): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    const dataUrl = await fileToAvatarDataUrl(file)
    if (!dataUrl) {
      setError('No pudimos procesar esa imagen (probá con PNG/JPG/WebP).')
      return
    }
    onChange(dataUrl)
  }

  return (
    <div className={styles.wrap}>
      <UserAvatar name={name || 'Nuevo usuario'} src={value || undefined} size={56} />
      <div className={styles.controls}>
        <div className={styles.actions}>
          <button type="button" className={styles.pickBtn} onClick={() => fileRef.current?.click()}>
            <ProductIcon id="new-file" size={13} />
            Subir foto
          </button>
          {value ? (
            <button type="button" className={styles.clearBtn} onClick={() => onChange('')}>
              <ProductIcon id="trash" size={13} />
              Quitar
            </button>
          ) : null}
        </div>
        <input
          className={styles.urlInput}
          value={value.startsWith('data:') ? '' : value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="…o pegá un enlace (https://)"
          spellCheck={false}
          aria-label="Enlace de la foto"
        />
        {value.startsWith('data:') ? <span className={styles.hint}>Foto cargada desde tu equipo.</span> : null}
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className={styles.fileInput}
        onChange={handleFile}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}

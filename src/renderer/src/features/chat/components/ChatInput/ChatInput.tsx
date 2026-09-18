import { ProductIcon } from '@services/productIcons/components'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type JSX,
  type KeyboardEvent
} from 'react'
import { ModelPicker } from '@features/providers'
import { IconButton } from '@ui'
import styles from './ChatInput.module.css'

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
  /** true mientras la IA genera: el botón pasa a "Detener" y se sigue escribiendo. */
  busy?: boolean
  /** Cancela la generación en curso (el botón de stop). */
  onStop?: () => void
}

/**
 * Input de chat, alto: textarea auto-resizable arriba + toolbar abajo con
 * el botón "+" a la izquierda y, a la derecha, el selector de proveedores
 * al lado del botón de enviar (que vive abajo, como ChatGPT).
 *
 * Mientras la IA genera (busy) el textarea NO se bloquea: el mismo botón
 * pasa a ser "Detener" (RecordStop) hasta que el stream termina.
 */
export function ChatInput({ onSend, disabled = false, busy = false, onStop }: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = !disabled && !busy && value.trim().length > 0

  // Auto-resize del textarea (hasta un máximo).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled || busy) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setValue(event.target.value)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submit()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className={styles.input}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Escribí un mensaje…"
        rows={1}
        disabled={disabled}
        aria-label="Mensaje"
      />

      <div className={styles.toolbar}>
        <IconButton
          type="button"
          shape="rounded"
          label="Adjuntar (próximamente)"
          disabled
          title="Adjuntar (próximamente)"
          size="sm"
          className={styles.sendBtnSm}
        >
          <ProductIcon id="plus" size={14} />
        </IconButton>

        <div className={styles.toolbarSpacer} aria-hidden="true" />

        <ModelPicker />

        {busy ? (
          <IconButton
            type="button"
            variant="accent"
            shape="rounded"
            label="Detener generación"
            size="sm"
            className={styles.sendNudge}
            onClick={onStop}
          >
            <ProductIcon id="record-stop" size={14} />
          </IconButton>
        ) : (
          <IconButton
            type="submit"
            variant="accent"
            shape="rounded"
            label="Enviar"
            disabled={!canSend}
            size="sm"
            className={styles.sendNudge}
          >
            <ProductIcon id="arrow-up" size={14} />
          </IconButton>
        )}
      </div>
    </form>
  )
}

import { ArrowUpIcon, PlusIcon } from '@proicons/react'
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
import { IconButton } from '@ui/IconButton'
import styles from './ChatInput.module.css'

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
}

/**
 * Input de chat, alto: textarea auto-resizable arriba + toolbar abajo con
 * el botón "+" a la izquierda y, a la derecha, el selector de proveedores
 * al lado del botón de enviar (que vive abajo, como ChatGPT).
 */
export function ChatInput({ onSend, disabled = false }: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = !disabled && value.trim().length > 0

  // Auto-resize del textarea (hasta un máximo).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
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
        >
          <PlusIcon size={16} />
        </IconButton>

        <div className={styles.toolbarSpacer} aria-hidden="true" />

        <ModelPicker />

        <IconButton type="submit" variant="accent" shape="rounded" label="Enviar" disabled={!canSend} size="sm" className={styles.sendBtnSm}>
          <ArrowUpIcon size={14} />
        </IconButton>
      </div>
    </form>
  )
}

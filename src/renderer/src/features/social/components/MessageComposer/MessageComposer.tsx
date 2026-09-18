import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type JSX,
  type KeyboardEvent
} from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { IconButton } from '@ui'
import type { DirectMessage, Friend } from '@shared/social'
import styles from './MessageComposer.module.css'

interface MessageComposerProps {
  onSend: (content: string) => void
  placeholder?: string
  disabled?: boolean
  replyTo?: DirectMessage | null
  onCancelReply?: () => void
  friends?: Friend[]
  onTyping?: (typing: boolean) => void
  replySenderName?: string
}

/**
 * Composer del chat social: textarea auto-resizable + botón de enviar.
 * Enter envía; Shift+Enter hace salto de línea. Soporta reply, typing y @mentions.
 */
export function MessageComposer({
  onSend,
  placeholder = 'Escribe un mensaje…',
  disabled = false,
  replyTo,
  onCancelReply,
  friends = [],
  onTyping,
  replySenderName
}: MessageComposerProps): JSX.Element {
  const [value, setValue] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeout = useRef<number | null>(null)
  const lastTyping = useRef(false)

  const canSend = !disabled && value.trim().length > 0

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  const sendTyping = (typing: boolean) => {
    if (lastTyping.current === typing) return
    lastTyping.current = typing
    onTyping?.(typing)
  }

  const scheduleTypingOff = () => {
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    typingTimeout.current = window.setTimeout(() => sendTyping(false), 3000)
  }

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    setShowMentions(false)
    sendTyping(false)
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
    if (event.key === 'Escape' && replyTo) {
      onCancelReply?.()
    }
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const v = event.target.value
    setValue(v)
    // typing telemetry
    if (v.length > 0) {
      sendTyping(true)
      scheduleTypingOff()
    } else {
      sendTyping(false)
    }
    // mention autocomplete
    const cursor = event.target.selectionStart ?? v.length
    const before = v.slice(0, cursor)
    const at = before.lastIndexOf('@')
    if (at !== -1 && (at === 0 || /\s/.test(before[at - 1]))) {
      const q = before.slice(at + 1)
      if (/^[a-z0-9_]{0,24}$/i.test(q)) {
        setMentionQuery(q.toLowerCase())
        setShowMentions(true)
        return
      }
    }
    setShowMentions(false)
  }

  const insertMention = (handle: string) => {
    const el = textareaRef.current
    if (!el) return
    const cursor = el.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const at = before.lastIndexOf('@')
    const newBefore = before.slice(0, at) + `@${handle} `
    const newValue = newBefore + after
    setValue(newValue)
    setShowMentions(false)
    // restore cursor
    setTimeout(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = newBefore.length
    }, 0)
    sendTyping(true)
    scheduleTypingOff()
  }

  const filteredFriends = friends.filter((f) => {
    if (!mentionQuery) return true
    return (f.handle ?? '').toLowerCase().includes(mentionQuery) || (f.displayName ?? '').toLowerCase().includes(mentionQuery)
  }).slice(0, 5)

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submit()
  }

  return (
    <div className={styles.wrap}>
      {replyTo ? (
        <div className={styles.replyPreview}>
          <span className={styles.replyLabel}>Respondiendo a {replySenderName ?? 'mensaje'}</span>
          <span className={styles.replyText}>{replyTo.body.slice(0, 80)}</span>
          <button className={styles.replyClose} onClick={onCancelReply} aria-label="Cancelar respuesta">
            <ProductIcon id="close" size={12} />
          </button>
        </div>
      ) : null}
      {showMentions && filteredFriends.length > 0 ? (
        <div className={styles.mentionList}>
          {filteredFriends.map((f) => (
            <button key={f.id} className={styles.mentionItem} onClick={() => insertMention(f.handle ?? '')}>
              @{f.handle ?? f.displayName}
            </button>
          ))}
        </div>
      ) : null}
      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label="Mensaje"
        />
        <IconButton
          type="submit"
          variant="accent"
          shape="rounded"
          label="Enviar"
          disabled={!canSend}
          size="sm"
          className={styles.send}
        >
          <ProductIcon id="arrow-up" size={14} />
        </IconButton>
      </form>
    </div>
  )
}

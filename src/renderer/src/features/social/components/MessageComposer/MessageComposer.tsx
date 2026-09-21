import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type JSX,
  type KeyboardEvent
} from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { IconButton } from '@ui'
import { IMAGE_RULES, type DirectMessage, type Friend, type ImageUpload } from '@shared/social'
import { EmojiPicker } from '../../emoji/EmojiPicker'
import styles from './MessageComposer.module.css'

interface MessageComposerProps {
  onSend: (content: string, images: ImageUpload[]) => Promise<{ ok: boolean; error?: string }>
  placeholder?: string
  disabled?: boolean
  replyTo?: DirectMessage | null
  onCancelReply?: () => void
  friends?: Friend[]
  onTyping?: (typing: boolean) => void
  replySenderName?: string
}

interface PendingImage {
  id: string
  name: string
  mime: string
  size: number
  /** data: URL — el CSP del renderer NO permite `blob:`, así que la
   *  miniatura tiene que ser data: (mismo formato que se sube). */
  dataUrl: string
  base64: string
  width: number | null
  height: number | null
}

const ALLOWED = IMAGE_RULES.allowedMime as readonly string[]

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('read'))
    reader.readAsDataURL(file)
  })
}

function base64Of(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

function dimsOf(dataUrl: string): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null })
    img.onerror = () => resolve({ width: null, height: null })
    img.src = dataUrl
  })
}

/**
 * Composer del chat social: textarea auto-resizable + botón de enviar.
 * Enter envía; Shift+Enter hace salto de línea. Soporta reply, typing,
 * @mentions y pegar imágenes con Ctrl+V (png/jpg/webp/gif/avif, máx 10 MB).
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
  const [pending, setPending] = useState<PendingImage[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const typingTimeout = useRef<number | null>(null)
  const lastTyping = useRef(false)

  const canSend = !disabled && !sending && (value.trim().length > 0 || pending.length > 0)

  // Cerrar el selector de emojis al clickear afuera.
  useEffect(() => {
    if (!showEmoji) return undefined
    const onDown = (event: PointerEvent): void => {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setShowEmoji(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [showEmoji])

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

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    setAttachError(null)
    let list: File[]
    try {
      list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    } catch {
      setAttachError('No se pudo leer el portapapeles.')
      return
    }
    if (list.length === 0) return
    const room = 8 - pending.length
    if (room <= 0) {
      setAttachError('Máximo 8 imágenes por mensaje.')
      return
    }
    const accepted: PendingImage[] = []
    for (const file of list.slice(0, room)) {
      if (!ALLOWED.includes(file.type)) {
        setAttachError('Formato no soportado (png, jpg, webp, gif, avif).')
        continue
      }
      if (file.size > IMAGE_RULES.maxBytes) {
        setAttachError(`"${file.name}" supera los 10 MB.`)
        continue
      }
      try {
        const dataUrl = await fileToDataUrl(file)
        if (!dataUrl.startsWith('data:image/')) {
          setAttachError('No se pudo procesar esa imagen.')
          continue
        }
        const dims = await dimsOf(dataUrl)
        accepted.push({
          id: `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
          name: file.name || 'imagen',
          mime: file.type,
          size: file.size,
          dataUrl,
          base64: base64Of(dataUrl),
          width: dims.width,
          height: dims.height
        })
      } catch {
        setAttachError('No se pudo procesar esa imagen.')
      }
    }
    if (accepted.length > 0) setPending((prev) => [...prev, ...accepted])
  }

  const removePending = (id: string): void => {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  const submit = (): void => {
    const trimmed = value.trim()
    if ((!trimmed && pending.length === 0) || disabled || sending) return
    setSending(true)
    setAttachError(null)
    const current = pending
    setPending([])
    void (async () => {
      try {
        const images: ImageUpload[] = current.map((p) => ({
          base64: p.base64,
          mime: p.mime,
          name: p.name,
          width: p.width,
          height: p.height
        }))
        const result = await onSend(trimmed, images)
        if (!result.ok) {
          // No se pierde nada: las miniaturas vuelven al composer con el error.
          setPending(current)
          setAttachError(result.error ?? 'No se pudo enviar.')
          return
        }
        setValue('')
        setShowMentions(false)
      } catch {
        setAttachError('No se pudo leer la imagen.')
        setPending(current)
      } finally {
        setSending(false)
        sendTyping(false)
        if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
      }
    })()
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

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const clipboard = event.clipboardData
    if (!clipboard) return
    // Archivos copiados (explorador): vienen en .files.
    const fromFiles = Array.from(clipboard.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (fromFiles.length > 0) {
      event.preventDefault()
      void addFiles(fromFiles)
      return
    }
    // Capturas y copias desde apps/navegador: vienen en .items (.files vacío).
    const fromItems: File[] = []
    for (const item of Array.from(clipboard.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) fromItems.push(file)
      }
    }
    if (fromItems.length > 0) {
      event.preventDefault()
      void addFiles(fromItems)
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

  const insertEmoji = (char: string): void => {
    const el = textareaRef.current
    if (!el) {
      setValue((prev) => prev + char)
      return
    }
    const cursor = el.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    setValue(before + char + after)
    setTimeout(() => {
      el.focus()
      const pos = before.length + char.length
      el.selectionStart = el.selectionEnd = pos
    }, 0)
  }

  const filteredFriends = friends.filter((f) => {
    if (!mentionQuery) return true
    return (f.handle ?? '').toLowerCase().includes(mentionQuery) || (f.displayName ?? '').toLowerCase().includes(mentionQuery)
  }).slice(0, 5)

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submit()
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>): void => {
    // Copiar ANTES de limpiar value: `input.value = ''` vacía también la
    // FileList viva (llega vacía a addFiles y no aparece ninguna miniatura).
    const chosen = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (chosen.length > 0) void addFiles(chosen)
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
      {pending.length > 0 ? (
        <div className={styles.pendingRow} aria-label="Imágenes por enviar">
          {pending.map((p) => (
            <div key={p.id} className={styles.pendingThumb}>
              <img src={p.dataUrl} alt={p.name} />
              <button
                type="button"
                className={styles.pendingRemove}
                onClick={() => removePending(p.id)}
                aria-label={`Quitar ${p.name}`}
              >
                <ProductIcon id="close" size={10} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {attachError ? <span className={styles.attachError}>{attachError}</span> : null}
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
        <div className={styles.emojiWrap} ref={emojiRef}>
          <IconButton
            type="button"
            shape="rounded"
            label="Emojis"
            size="sm"
            className={styles.attach}
            onClick={() => setShowEmoji((prev) => !prev)}
            disabled={disabled}
          >
            <span className={styles.emojiGlyph} aria-hidden="true">
              😊
            </span>
          </IconButton>
          {showEmoji ? <EmojiPicker onPick={insertEmoji} /> : null}
        </div>
        <IconButton
          type="button"
          shape="rounded"
          label="Adjuntar imagen"
          size="sm"
          className={styles.attach}
          onClick={() => fileRef.current?.click()}
          disabled={disabled || sending}
        >
          <ProductIcon id="plus" size={14} />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          multiple
          className={styles.fileInput}
          onChange={handleFile}
          tabIndex={-1}
          aria-hidden="true"
        />
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label="Mensaje"
        />
        <IconButton
          type="submit"
          variant="accent"
          shape="rounded"
          label={sending ? 'Enviando…' : 'Enviar'}
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

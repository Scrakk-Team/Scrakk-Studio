// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import {
  useCallback,
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
import {
  IMAGE_RULES,
  SOCIAL_RULES,
  type DirectMessage,
  type Friend,
  type ImageUpload
} from '@shared/social'
import { EmojiPicker } from '../../emoji/EmojiPicker'
import { useDropSink, useResourceDrop } from '@features/dnd'
import { tabsStore } from '@features/tabs'
import { useFileIconUrl } from '@services/fileIcons'
import { shareFileToSocial } from '../../actions/shareFile'
import styles from './MessageComposer.module.css'

import { t } from '@core/i18n'
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

/** Archivo linkeado al composer: se comparte como mensaje `codefile`. */
interface LinkedFile {
  path: string
  name: string
}

/** Tope de archivos linkeados por envío. */
const MAX_LINKED = 5

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
/** Mini-card de un archivo linkeado: ícono del pack activo + nombre + quitar. */
function LinkedFileChip({
  file,
  onRemove
}: {
  file: LinkedFile
  onRemove: () => void
}): JSX.Element {
  const iconUrl = useFileIconUrl(file.name, false, undefined, { path: file.path })
  return (
    <div className={styles.linkedCard} title={file.path}>
      {iconUrl ? (
        <img src={iconUrl} alt="" width={13} height={13} />
      ) : (
        <ProductIcon id="file" size={13} />
      )}
      <span className={styles.linkedName}>{file.name}</span>
      <button
        type="button"
        className={styles.linkedRemove}
        onClick={onRemove}
        aria-label={t('social.borrar.archivo')}
      >
        <ProductIcon id="close" size={10} />
      </button>
    </div>
  )
}

export function MessageComposer({
  onSend,
  placeholder = t('social.escribe.un.mensaje'),
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
  const [linked, setLinked] = useState<LinkedFile[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const typingTimeout = useRef<number | null>(null)
  const lastTyping = useRef(false)

  // Contador estilo Discord: se muestra al acercarse al tope y avisa al pasarse.
  const maxChars = SOCIAL_RULES.messageMax
  const remaining = maxChars - value.length
  const showCounter = value.length > 0 && remaining <= 300

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

  // Ajusta el alto del textarea al contenido (tope 140px). Es estable para
  // poder usarla en los dos efectos que la necesitan.
  const fitHeight = useCallback((): void => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [])

  useEffect(() => {
    fitHeight()
  }, [value, fitHeight])

  // El alto también depende del ANCHO: al agrandar el panel, el placeholder
  // deja de ocupar dos líneas y el textarea tiene que volver a su alto
  // compacto (si no, se queda con el alto que tenía al ancho mínimo).
  useEffect(() => {
    const el = textareaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    let lastWidth = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return
      lastWidth = el.clientWidth
      fitHeight()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitHeight])

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
      setAttachError(t('social.no.se.pudo.leer.el'))
      return
    }
    if (list.length === 0) return
    const room = 8 - pending.length
    if (room <= 0) {
      setAttachError(t('social.maximo.8.imagenes.por.mensaje'))
      return
    }
    const accepted: PendingImage[] = []
    for (const file of list.slice(0, room)) {
      if (!ALLOWED.includes(file.type)) {
        setAttachError(t('social.formato.no.soportado.png.jpg'))
        continue
      }
      if (file.size > IMAGE_RULES.maxBytes) {
        setAttachError(`"${file.name}" supera los 10 MB.`)
        continue
      }
      try {
        const dataUrl = await fileToDataUrl(file)
        if (!dataUrl.startsWith('data:image/')) {
          setAttachError(t('social.no.se.pudo.procesar.esa'))
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
        setAttachError(t('social.no.se.pudo.procesar.esa'))
      }
    }
    if (accepted.length > 0) setPending((prev) => [...prev, ...accepted])
  }

  const addLinked = (files: LinkedFile[]): void => {
    setLinked((prev) => {
      const seen = new Set(prev.map((f) => f.path))
      const next = [...prev]
      for (const file of files) {
        if (!file.path || seen.has(file.path)) continue
        seen.add(file.path)
        next.push(file)
      }
      return next.slice(0, MAX_LINKED)
    })
  }

  const removeLinked = (path: string): void => {
    setLinked((prev) => prev.filter((f) => f.path !== path))
  }

  // Drop NATIVO del Explorer (archivos/carpetas) sobre el input.
  const resourceDrop = useResourceDrop((items) => {
    addLinked(items.filter((i) => i.kind === 'file').map((i) => ({ path: i.path, name: i.name })))
  })

  // Drop por POINTER de una tab del layout: se resuelve a su archivo.
  const tabSink = useDropSink((payload) => {
    if (payload.type !== 'tab') return
    const tab = tabsStore.getTab(payload.tabId)
    if (!tab || tab.kind !== 'file' || !tab.filePath) return
    addLinked([{ path: tab.filePath, name: tab.label ?? tab.filePath }])
  })

  const removePending = (id: string): void => {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  const submit = (): void => {
    const trimmed = value.trim()
    if ((!trimmed && pending.length === 0 && linked.length === 0) || disabled || sending) return
    setSending(true)
    setAttachError(null)
    const current = pending
    const files = linked
    setPending([])
    setLinked([])
    void (async () => {
      try {
        // Archivos linkeados: cada uno se comparte como mensaje `codefile`
        // (contenido a R2). Si además hay texto o imágenes, va el mensaje normal.
        for (const file of files) {
          await shareFileToSocial(file.path)
        }
        if (trimmed || current.length > 0) {
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
            setLinked(files)
            setAttachError(result.error ?? t('social.no.se.pudo.enviar'))
            return
          }
        }
        setValue('')
        setShowMentions(false)
      } catch {
        setAttachError(t('social.no.se.pudo.leer.la'))
        setPending(current)
        setLinked(files)
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
    <div
      className={styles.wrap}
      data-drop-active={resourceDrop.active || tabSink.active ? '' : undefined}
      ref={tabSink.ref}
      onDragOver={resourceDrop.onDragOver}
      onDragLeave={resourceDrop.onDragLeave}
      onDrop={resourceDrop.onDrop}
    >
      {replyTo ? (
        <div className={styles.replyPreview}>
          <span className={styles.replyLabel}>{t('social.respondiendo.a')} {replySenderName ?? t('social.mensaje')}</span>
          <span className={styles.replyText}>
            {replyTo.body.trim().slice(0, 80) ||
              (replyTo.attachments?.length ? t('social.imagen.adjunta') : '')}
          </span>
          <button className={styles.replyClose} onClick={onCancelReply} aria-label={t('social.cancelar.respuesta')}>
            <ProductIcon id="close" size={12} />
          </button>
        </div>
      ) : null}
      {pending.length > 0 ? (
        <div className={styles.pendingRow} aria-label={t('social.imagenes.por.enviar')}>
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
      {linked.length > 0 ? (
        <div className={styles.linkedRow}>
          {linked.map((file) => (
            <LinkedFileChip key={file.path} file={file} onRemove={() => removeLinked(file.path)} />
          ))}
        </div>
      ) : null}
      {attachError ? <span className={styles.attachError}>{attachError}</span> : null}
      {showCounter ? (
        <span className={remaining <= 0 ? styles.counterOver : styles.counter}>
          {remaining}
        </span>
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
        {/* Emoji + adjuntar van juntos y compactos; el separador cierra el
            grupo antes del input. */}
        <div className={styles.tools}>
          <div className={styles.emojiWrap} ref={emojiRef}>
            <IconButton
              type="button"
              shape="rounded"
              label={t('social.emojis')}
              size="sm"
              className={styles.attach}
              onClick={() => setShowEmoji((prev) => !prev)}
              disabled={disabled}
            >
              <ProductIcon id="emoji" size={14} />
            </IconButton>
            {showEmoji ? <EmojiPicker onPick={insertEmoji} /> : null}
          </div>
          <IconButton
            type="button"
            shape="rounded"
            label={t('social.adjuntar.imagen')}
            size="sm"
            className={styles.attach}
            onClick={() => fileRef.current?.click()}
            disabled={disabled || sending}
          >
            <ProductIcon id="plus" size={14} />
          </IconButton>
          <span className={styles.toolsDivider} aria-hidden="true" />
        </div>
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
          aria-label={t('social.mensaje')}
        />
      </form>
    </div>
  )
}

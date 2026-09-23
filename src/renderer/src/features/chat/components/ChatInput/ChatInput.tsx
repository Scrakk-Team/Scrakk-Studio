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
import { IconButton } from '@ui'
import { slashCommands, type SlashCommand } from '@services/slash-commands'
import { subagentsForMode, type AgentProfile } from '@services/ai/agents'
import { getModeId } from '@services/ai/prompts/modes'
import { bumpEffortTyping } from '../EffortSparks/EffortSparks'
import { registerChatInputAnchor } from './inputAnchor'
import styles from './ChatInput.module.css'

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
  /** true mientras la IA genera: el botón pasa a "Detener" y se sigue escribiendo. */
  busy?: boolean
  /** Cancela la generación en curso (el botón de stop). */
  onStop?: () => void
  /**
   * Estado del input: 'active' (normal) o 'locked' (bloqueado, no se puede
   * escribir — p. ej. mientras estás dentro del chat de un subagente).
   */
  state?: 'active' | 'locked'
  /** Texto del placeholder cuando está bloqueado. */
  lockedText?: string
}

/**
 * Input de chat: textarea auto-resizable + toolbar con el botón "+" a la
 * izquierda y el de enviar/detener a la derecha. El selector de modelo y el
 * modo viven ABAJO del input (los monta el ChatPanel), no dentro de la barra.
 *
 * Mientras la IA genera (busy) el textarea NO se bloquea: el mismo botón
 * pasa a ser "Detener" (RecordStop) hasta que el stream termina.
 *
 * `state: 'locked'` lo deshabilita por completo (spawn de subagente): se ve
 * bloqueado y no acepta escritura.
 */
export function ChatInput({
  onSend,
  disabled = false,
  busy = false,
  onStop,
  state = 'active',
  lockedText
}: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<SlashCommand[]>([])
  const [agentSuggestions, setAgentSuggestions] = useState<AgentProfile[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const locked = state === 'locked'
  const canSend = !disabled && !locked && !busy && value.trim().length > 0

  // Autocompletado de comandos: al escribir `/` (sin espacio todavía) se
  // listan los comandos registrados que matchean. El sistema es global; acá
  // solo se muestra.
  useEffect(() => {
    const update = (): void => {
      const trimmed = value.trimStart()
      if (locked || !trimmed.startsWith('/') || trimmed.includes(' ')) {
        setSuggestions([])
        return
      }
      setSuggestions(slashCommands.match(trimmed.slice(1)))
    }
    update()
    return slashCommands.subscribe(update)
  }, [value, locked])

  // Mención de subagente: al escribir `@` (sin espacio) se listan los
  // subagentes habilitados para el modo/agente activo.
  useEffect(() => {
    const trimmed = value.trimStart()
    if (locked || !trimmed.startsWith('@') || trimmed.includes(' ')) {
      setAgentSuggestions([])
      return
    }
    const query = trimmed.slice(1).toLowerCase()
    setAgentSuggestions(
      subagentsForMode(getModeId()).filter(
        (agent) =>
          agent.id.toLowerCase().startsWith(query) ||
          agent.label.toLowerCase().startsWith(query)
      )
    )
  }, [value, locked])

  // Auto-resize del textarea (hasta un máximo).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  // Publica el rect del input para que la confirmación de tools se ancle
  // arriba (mismo lugar que el autocompletado de comandos).
  useEffect(() => {
    registerChatInputAnchor(() => formRef.current?.getBoundingClientRect() ?? null)
    return () => registerChatInputAnchor(null)
  }, [])

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled || locked || busy) return
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
    // Enciende las chispas del esfuerzo máx. (no hace nada si no está activo).
    bumpEffortTyping()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submit()
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      data-locked={locked ? '' : undefined}
      onSubmit={handleSubmit}
    >
      {suggestions.length > 0 ? (
        <div className={styles.suggestions} role="listbox" aria-label="Comandos">
          {suggestions.map((command) => (
            <button
              key={command.name}
              type="button"
              className={styles.suggestion}
              onClick={() => {
                setValue(`/${command.name} `)
                textareaRef.current?.focus()
              }}
            >
              <span className={styles.suggestionName}>/{command.name}</span>
              <span className={styles.suggestionDesc}>{command.description}</span>
            </button>
          ))}
        </div>
      ) : null}
      {agentSuggestions.length > 0 ? (
        <div className={styles.suggestions} role="listbox" aria-label="Subagentes">
          {agentSuggestions.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className={styles.suggestion}
              onClick={() => {
                setValue(`@${agent.id} `)
                textareaRef.current?.focus()
              }}
            >
              <span className={styles.suggestionName}>@{agent.id}</span>
              <span className={styles.suggestionDesc}>{agent.description ?? agent.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        className={styles.input}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={locked ? (lockedText ?? 'Bloqueado: estás dentro de un subagente') : 'Escribe un mensaje…'}
        rows={1}
        disabled={disabled || locked}
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

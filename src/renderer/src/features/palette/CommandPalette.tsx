/**
 * CommandPalette — overlay de comandos (mod+shift+p / SearchBar).
 *
 * Lista fuzzy sobre el CommandRegistry, navegación por teclado, Enter
 * ejecuta. Se abre vía evento 'open-command-palette' o el shortcut global.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  commandRegistry,
  onOpenCommandPalette,
  runCommand,
  type Command
} from '@services/commands'
import { formatCombo } from '@services/shortcuts/format'

/** Query vacío = TODA la lista, sin pasar por el scorer. */
function resolveResults(query: string): Command[] {
  const trimmed = query.trim()
  return trimmed.length > 0 ? commandRegistry.search(trimmed) : commandRegistry.list()
}
import { shortcuts } from '@services/shortcuts'
import styles from './CommandPalette.module.css'

export function CommandPalette(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const open_ = useCallback((): void => {
    setQuery('')
    setSelected(0)
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // Apertura por evento + atajo global (como VS Code).
  useEffect(() => {
    return onOpenCommandPalette(open_)
  }, [open_])

  useEffect(() => {
    const unsub = shortcuts.register({
      id: 'palette.open',
      combo: 'mod+shift+p',
      handler: () => open_(),
      allowInInput: true,
      priority: 50
    })
    return unsub
  }, [open_])

  useEffect(() => {
    if (!open) return undefined
    const unsub = shortcuts.register({
      id: 'palette.close',
      combo: 'escape',
      handler: () => setOpen(false),
      allowInInput: true,
      priority: 100
    })
    return unsub
  }, [open])

  // Re-suscribirse para re-render al registrar/desregistrar comandos.
  const [version, setVersion] = useState(0)
  useEffect(() => commandRegistry.subscribe(() => setVersion((v) => v + 1)), [])

  const results = useMemo<Command[]>(
    () => resolveResults(query),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, version]
  )

  const execute = useCallback(
    async (command: Command): Promise<void> => {
      setOpen(false)
      await runCommand(command.id)
    },
    []
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((index) => Math.min(index + 1, results.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const command = results[selected]
        if (command) void execute(command)
      }
    },
    [results, selected, execute]
  )

  // Scroll del ítem seleccionado a la vista.
  useEffect(() => {
    resultsRef.current?.querySelectorAll('button')[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div className={styles.panel} role="dialog" aria-label="Paleta de comandos">
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Escribe un comando…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(0)
          }}
          onKeyDown={handleKeyDown}
          aria-label="Buscar comando"
        />
        <div className={styles.results} ref={resultsRef}>
          {results.length === 0 ? (
            <p className={styles.empty}>Sin resultados</p>
          ) : (
            results.map((command, index) => (
              <button
                key={command.id}
                type="button"
                className={[styles.item, index === selected ? styles.itemSelected : null]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => setSelected(index)}
                onClick={() => void execute(command)}
                title={command.id + (command.keybinding ? ` (${formatCombo(command.keybinding)})` : '')}
              >
                <span className={styles.title}>{command.title}</span>
                <span className={styles.meta}>
                  {command.keybinding ? (
                    <kbd className={styles.kbd}>{formatCombo(command.keybinding)}</kbd>
                  ) : null}
                  {command.category ? <span className={styles.category}>{command.category}</span> : null}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

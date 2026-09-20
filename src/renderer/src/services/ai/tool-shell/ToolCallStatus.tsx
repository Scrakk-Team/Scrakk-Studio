/**
 * ToolCallStatus — renders the appropriate status indicator.
 *
 * Mientras carga (pending/streaming/running) NO dibuja nada: el estado de
 * carga lo muestra el visual de cada tool (su shimmer de texto vive en la
 * carpeta visual/ de cada tool, con sus propios estilos).
 */

import type { JSX } from 'react'

type ToolCallStatusType = 'pending' | 'streaming' | 'running' | 'success' | 'error' | 'blocked'

interface ToolCallStatusProps {
  status: ToolCallStatusType
  /** Error message for error status */
  errorMessage?: string
}

function SuccessCheck(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="9.25" />
      <path strokeLinejoin="round" d="m16.375 9.194-5.611 5.612-3.139-3.134" />
    </svg>
  )
}

function ErrorIcon({ errorMessage }: { errorMessage?: string }): JSX.Element {
  return (
    <span
      className={errorMessage ? 'tool-call-error-clickable' : ''}
      onClick={(e) => {
        if (errorMessage) {
          e.stopPropagation()
          navigator.clipboard.writeText(errorMessage)
        }
      }}
      title={errorMessage ? 'Copiar error al portapapeles' : undefined}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="9.25" />
        <path d="m8.875 8.875 6.25 6.25m0-6.25-6.25 6.25" />
      </svg>
    </span>
  )
}

function BlockedIcon(): JSX.Element {
  return (
    <span className="tool-call-blocked-label">Bloqueado</span>
  )
}

export function ToolCallStatus({ status, errorMessage }: ToolCallStatusProps): JSX.Element | null {
  // Cargando/executando → nada aquí: el shimmer lo pinta el visual de cada tool.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return null
  }

  return (
    <div className="tool-call-status">
      {status === 'success' ? (
        <SuccessCheck />
      ) : status === 'error' ? (
        <ErrorIcon errorMessage={errorMessage} />
      ) : status === 'blocked' ? (
        <BlockedIcon />
      ) : null}
    </div>
  )
}

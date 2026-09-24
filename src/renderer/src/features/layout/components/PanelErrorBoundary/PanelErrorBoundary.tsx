// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './PanelErrorBoundary.module.css'

interface PanelErrorBoundaryProps {
  children: ReactNode
}

interface PanelErrorBoundaryState {
  error: Error | null
}

/**
 * Aislamiento de errores por panel: si un panel lanza un error en render,
 * SOLO ese panel muestra el fallback y el resto de la app sigue viva.
 */
export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): PanelErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // El error queda aislado en el panel; se loguea para debuggear.
    console.error('[PanelErrorBoundary]', error, info)
  }

  private handleRetry = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error) {
      return (
        <div className={styles.wrapper} role="alert">
          <p className={styles.title}>Este panel falló</p>
          <p className={styles.message}>{error.message || 'Error desconocido'}</p>
          <button type="button" className={styles.retry} onClick={this.handleRetry}>
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import styles from './AppErrorBoundary.module.css'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
  info: ErrorInfo | null
  copied: boolean
}

function errorText(error: Error, info: ErrorInfo | null): string {
  const stack = error.stack ?? String(error)
  const component = info?.componentStack ?? ''
  return `${error.name}: ${error.message}\n${stack}${component ? `\n${component}` : ''}`
}

/**
 * Red global anti-pantalla-negra: si ALGO revienta el render fuera de un
 * panel (providers, shell, layout), tapa la app con el fallo + stack
 * copiable, en vez de negro. Mismo lenguaje que PanelErrorBoundary.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, info: null, copied: false }

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      copied: false
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary]', error, info)
    this.setState({ info })
  }

  private handleRetry = (): void => {
    this.setState({ error: null, info: null, copied: false })
  }

  private handleCopy = (): void => {
    const { error, info } = this.state
    if (!error) return
    const text = errorText(error, info)
    try {
      const clip = navigator.clipboard
      if (clip?.writeText) {
        clip
          .writeText(text)
          .then(() => this.setState({ copied: true }))
          .catch(() => this.setState({ copied: false }))
        return
      }
    } catch {
      // Sin clipboard: no-op.
    }
    this.setState({ copied: false })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {    const { error, info, copied } = this.state
    if (!error) return this.props.children
    return (
      <div className={styles.screen} role="alert">
        <div className={styles.card}>
          <span className={styles.icon} aria-hidden="true">
            <ProductIcon id="alert" size={28} />
          </span>
          <h1 className={styles.title}>Algo falló</h1>
          <p className={styles.message}>{error.message || 'Error desconocido'}</p>
          <pre className={styles.stack}>{errorText(error, info)}</pre>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={this.handleRetry}>
              Reintentar
            </button>
            <button type="button" className={styles.ghost} onClick={this.handleCopy}>
              <ProductIcon id="copy" size={14} />
              {copied ? 'Copiado' : 'Copiar error'}
            </button>
            <button type="button" className={styles.ghost} onClick={this.handleReload}>
              <ProductIcon id="refresh" size={14} />
              Recargar
            </button>
          </div>
        </div>
      </div>
    )
  }
}

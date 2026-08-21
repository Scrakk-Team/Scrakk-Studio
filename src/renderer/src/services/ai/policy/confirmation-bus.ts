/**
 * Confirmation bus — shows UI confirmation dialogs for dangerous operations.
 *
 * Tools that need user approval emit a confirmation request through this bus.
 * The UI listens and shows a modal. The user can approve, reject, or approve-always.
 */

export type ConfirmationResponse = 'approved' | 'rejected' | 'approved_always'

export interface ConfirmationRequest {
  id: string
  reason: string
  detail: string
  toolName: string
  toolArgs: Record<string, unknown>
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  details?: string[]
  resolve: (response: ConfirmationResponse) => void
}

type ConfirmationListener = (request: ConfirmationRequest) => void

class ConfirmationBus {
  private pending = new Map<string, ConfirmationRequest>()
  private listeners = new Set<ConfirmationListener>()

  /**
   * Subscribe to confirmation requests. Called by the UI to show modals.
   */
  subscribe(listener: ConfirmationListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Request user confirmation. Returns a promise that resolves when the user responds.
   */
  requestConfirmation(
    reason: string,
    detail: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    options?: {
      riskLevel?: 'low' | 'medium' | 'high' | 'critical'
      details?: string[]
    }
  ): Promise<ConfirmationResponse> {
    return new Promise((resolve) => {
      const id = `conf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const request: ConfirmationRequest = {
        id,
        reason,
        detail,
        toolName,
        toolArgs,
        riskLevel: options?.riskLevel,
        details: options?.details,
        resolve
      }

      this.pending.set(id, request)

      // Notify all listeners
      for (const listener of this.listeners) {
        try {
          listener(request)
        } catch (err) {
          console.error('[ConfirmationBus] listener error:', err)
        }
      }

      // Timeout después de 60s — rechaza si nadie respondió (no dejar al
      // agente colgado esperando una confirmación que nadie ve).
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve('rejected')
        }
      }, 60 * 1000)
    })
  }

  /**
   * Resolve a pending confirmation request. Called by the UI when the user responds.
   */
  resolve(id: string, response: ConfirmationResponse): void {
    const request = this.pending.get(id)
    if (request) {
      this.pending.delete(id)
      request.resolve(response)
    }
  }
}

export const confirmationBus = new ConfirmationBus()

/**
 * Items de barra de estado aportados por extensiones.
 *
 * El host empuja el modelo del item (`status/item`); aquí se guardan y la
 * StatusBar los dibuja MEZCLADOS con los chips propios del IDE — no hay una
 * barra aparte para extensiones, igual que en VS Code.
 *
 * Patrón de store externo con `subscribe()` (igual que el resto de la app).
 * El click de un item corre su comando: primero por el registry del IDE
 * (comandos built-in) y, si el IDE no lo tiene, se le pide al host de la
 * extensión dueña (sus comandos viven allá).
 */

import { runCommand } from '@services/commands'
import type { StatusBarItemModel, StatusBarItemPayload } from '@shared/extensionHost/protocol'

type Listener = () => void

class ExtensionStatusBarStore {
  private items = new Map<string, StatusBarItemModel>()
  private listeners = new Set<Listener>()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // Un suscriptor roto no tumba a los demás.
      }
    }
  }

  /** Alta o actualización (o baja, con `{ id, removed: true }`). */
  apply(payload: StatusBarItemPayload): void {
    if (!payload || typeof payload !== 'object' || !('id' in payload)) return
    if ('removed' in payload) {
      if (this.items.delete(payload.id)) this.emit()
      return
    }
    const model = payload as StatusBarItemModel
    this.items.set(model.id, model)
    this.emit()
  }

  /** Todo lo de una extensión se va si su host muere o se desactiva. */
  dropExtension(extensionId: string): void {
    let changed = false
    for (const [id, item] of this.items) {
      if (item.extensionId === extensionId) {
        this.items.delete(id)
        changed = true
      }
    }
    if (changed) this.emit()
  }

  /** Items visibles, ordenados como en VS Code (prioridad mayor primero). */
  list(alignment: 'left' | 'right'): StatusBarItemModel[] {
    return [...this.items.values()]
      .filter((item) => item.visible && item.alignment === alignment)
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * Corre el comando del item. El registry del IDE va primero (es el dueño de
   * los comandos de la app); si no lo conoce, el comando es de la EXTENSIÓN y
   * lo ejecuta su host, con los argumentos intactos.
   */
  async activate(id: string): Promise<void> {
    const item = this.items.get(id)
    if (!item?.command) return
    if (await runCommand(item.command)) return
    try {
      const result = await window.api?.extensions?.host?.executeCommand({
        id: item.extensionId,
        command: item.command,
        args: []
      })
      if (result && !result.success) {
        console.warn(`[statusbar] "${item.command}" falló: ${result.error ?? 'error desconocido'}`)
      }
    } catch (error) {
      console.warn(`[statusbar] no se pudo correr "${item.command}":`, error)
    }
  }
}

export const extensionStatusBar = new ExtensionStatusBarStore()

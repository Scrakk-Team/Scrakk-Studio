// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Paneles de webview en el ÁREA DEL EDITOR (`window.createWebviewPanel`).
 *
 * Un panel de estos es una TAB del centro: la extensión publica HTML y el IDE
 * lo muestra en un iframe aislado igual que las vistas de la activity bar
 * (mismo `scrakk-ext://`, mismo shim de `acquireVsCodeApi`).
 *
 * Este módulo es el pegamento con el sistema de layout:
 *  1. registra el panel en el `ExtensionRegistry` (así el layout sabe montarlo
 *     y qué título mostrar),
 *  2. abre/cierra su tab cuando la extensión lo muestra/oculta, y
 *  3. avisa a la extensión si el USUARIO cierra la tab (si no, la extensión
 *     seguiría creyendo que su panel está abierto: `onDidDispose` nunca
 *     llegaría y `visible` quedaría mintiendo).
 */

import { ExtensionRegistry } from '@services/extensions'
import type { PanelEntry } from '@features/layout'
import { openPanelTab, closePanelTabEverywhere } from '@features/layout/actions'
import { tabsStore } from '@features/tabs'
import type { WebviewPanelModel } from '@shared/extensionHost/protocol'
import { ExtensionWebviewPanelLoader } from '@features/extensionviews/ExtensionWebviewPanelLoader'
import { webviewPanelId } from '@features/extensionviews/ids'

type Listener = () => void

class ExtensionPanelsStore {
  private panels = new Map<string, WebviewPanelModel>()
  private listeners = new Set<Listener>()
  /** Paneles cuyo cierre ya avisamos a la extensión (no repetirlo). */
  private closedReported = new Set<string>()
  private unsubscribeTabs: (() => void) | null = null

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

  get(rawId: string): WebviewPanelModel | undefined {
    return this.panels.get(rawId)
  }

  list(): WebviewPanelModel[] {
    return [...this.panels.values()]
  }

  /**
   * Alta o actualización de un panel (el host emite `panel/open` para las dos
   * cosas: la identidad es el id).
   */
  upsert(model: WebviewPanelModel): void {
    if (!model?.id) return
    const previous = this.panels.get(model.id)
    this.panels.set(model.id, model)
    this.closedReported.delete(model.id)

    if (!previous) {
      // Primera vez: el layout necesita la entrada ANTES de abrir la tab
      // (el título de la tab sale de aquí).
      ExtensionRegistry.registerPanel(this.panelEntry(model), model.extensionId)
      this.ensureTabReconciliation()
    }

    if (model.visible) {
      openPanelTab('center', webviewPanelId(model.id))
    } else {
      // La extensión lo ocultó: su tab se va (como `panel.dispose()` en VS Code
      // cuando la extensión esconde el panel sin cerrarlo).
      closePanelTabEverywhere(webviewPanelId(model.id))
    }

    // Cambios de título: el header de la tab sigue a la extensión.
    if (previous && previous.title !== model.title) this.emit()
  }

  /** El panel se cerró del lado de la extensión. */
  close(rawId: string): void {
    const model = this.panels.get(rawId)
    if (!model) return
    this.panels.delete(rawId)
    this.closedReported.add(rawId)
    ExtensionRegistry.unregisterPanel(webviewPanelId(rawId))
    closePanelTabEverywhere(webviewPanelId(rawId))
    this.emit()
  }

  /** Todos los paneles de una extensión (host muerto o extensión apagada). */
  dropExtension(extensionId: string): void {
    for (const [rawId, model] of [...this.panels]) {
      if (model.extensionId === extensionId) this.close(rawId)
    }
  }

  private panelEntry(model: WebviewPanelModel): PanelEntry {
    return {
      id: webviewPanelId(model.id),
      title: model.title,
      closable: true,
      component: ExtensionWebviewPanelLoader
    }
  }

  /**
   * Reconciliación: si la tab de un panel desaparece porque el USUARIO la
   * cerró, se lo contamos a la extensión (que dispara su `onDidDispose`).
   * Se suscribe una sola vez, cuando aparece el primer panel.
   */
  private ensureTabReconciliation(): void {
    if (this.unsubscribeTabs) return
    this.unsubscribeTabs = tabsStore.subscribe(() => this.reconcile())
  }

  private reconcile(): void {
    for (const [rawId, model] of [...this.panels]) {
      if (this.closedReported.has(rawId)) continue
      // Un panel que la extensión OCULTÓ no tiene tab a propósito: no es un
      // cierre del usuario (la extensión sigue siendo dueña del panel).
      if (!model.visible) continue
      const tabId = `panel:${webviewPanelId(rawId)}`
      let present = false
      for (const stripId of Object.keys(tabsStore.getAll())) {
        if (tabsStore.getStrip(stripId)?.tabs.some((tab) => tab.id === tabId)) {
          present = true
          break
        }
      }
      if (present) continue
      // La tab se fue sin que nosotros la cerráramos: fue el usuario.
      this.closedReported.add(rawId)
      this.panels.delete(rawId)
      ExtensionRegistry.unregisterPanel(webviewPanelId(rawId))
      this.emit()
      void window.api?.extensions?.host?.panelClose({ id: model.extensionId, panelId: rawId })
    }
  }
}

export const extensionPanels = new ExtensionPanelsStore()

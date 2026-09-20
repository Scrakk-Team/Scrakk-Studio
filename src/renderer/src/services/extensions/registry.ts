/**
 * ExtensionRegistry — store externo de contribuciones de extensiones.
 *
 * Patrón de la app (como `services/shortcuts/registry.ts`): un único store
 * con `subscribe()`. Los sistemas de la app (layout, activity bar, tabs)
 * leen aquí y se re-renderizan al instalarse/quitarse extensiones.
 *
 * El registry NO conoce ni el formato del manifest ni cómo se cargan los
 * componentes: solo guarda contribuciones ya resueltas.
 */

import type { PanelEntry, PanelId } from '@features/layout'
import type { ActivityBarButton } from '@features/activitybar'
import type { RegisteredCenterTab, RegisteredExtension } from './manifest'

type ContributionKind = 'panel' | 'activityBar' | 'centerTab'

class ExtensionRegistryClass {
  private panels = new Map<PanelId, PanelEntry>()
  private activityButtons = new Map<string, ActivityBarButton>()
  private centerTabs = new Map<PanelId, RegisteredCenterTab>()
  private extensions = new Map<string, RegisteredExtension>()
  /** Qué ids le pertenecen a cada extensión (para desinstalar limpio). */
  private ownedBy = new Map<string, { kind: ContributionKind; id: string }[]>()
  private listeners = new Set<() => void>()

  // ── Suscripción ─────────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }

  private track(extensionId: string | undefined, kind: ContributionKind, id: string): void {
    if (!extensionId) return
    const owned = this.ownedBy.get(extensionId) ?? []
    owned.push({ kind, id })
    this.ownedBy.set(extensionId, owned)
  }

  // ── Extensiones (metadatos) ─────────────────────────────────────────────

  registerExtension(meta: RegisteredExtension): void {
    this.extensions.set(meta.id, meta)
    this.emit()
  }

  getExtensions(): RegisteredExtension[] {
    return [...this.extensions.values()]
  }

  /** Metadata de UNA extensión (null si no está registrada). */
  getExtension(id: string): RegisteredExtension | null {
    return this.extensions.get(id) ?? null
  }

  /** Cuántas contribuciones aporta una extensión (por tipo). */
  getContributionCount(extensionId: string): {
    panels: number
    activityBar: number
    centerTabs: number
  } {
    const owned = this.ownedBy.get(extensionId) ?? []
    return {
      panels: owned.filter((o) => o.kind === 'panel').length,
      activityBar: owned.filter((o) => o.kind === 'activityBar').length,
      centerTabs: owned.filter((o) => o.kind === 'centerTab').length
    }
  }

  // ── Paneles ─────────────────────────────────────────────────────────────

  registerPanel(entry: PanelEntry, extensionId?: string): void {
    this.panels.set(entry.id, entry)
    this.track(extensionId, 'panel', entry.id)
    this.emit()
  }

  getPanel(id: PanelId): PanelEntry | null {
    return this.panels.get(id) ?? null
  }

  getAllPanels(): PanelEntry[] {
    return [...this.panels.values()]
  }

  // ── Activity bar ────────────────────────────────────────────────────────

  registerActivityButton(button: ActivityBarButton, extensionId?: string): void {
    this.activityButtons.set(button.id, button)
    this.track(extensionId, 'activityBar', button.id)
    this.emit()
  }

  getActivityButtons(): ActivityBarButton[] {
    return [...this.activityButtons.values()]
  }

  // ── Tabs centrales ──────────────────────────────────────────────────────

  registerCenterTab(tab: RegisteredCenterTab, extensionId?: string): void {
    this.centerTabs.set(tab.id, tab)
    this.track(extensionId, 'centerTab', tab.id)
    this.emit()
  }

  getCenterTabs(): RegisteredCenterTab[] {
    return [...this.centerTabs.values()]
  }

  // ── Desregistro ─────────────────────────────────────────────────────────

  /** Remueve UN panel (uso del handler del tipo 'panels'). */
  unregisterPanel(id: PanelId): void {
    if (!this.panels.delete(id)) return
    this.emit()
  }

  /** Remueve UN botón de activity bar (handler de 'activityBar'). */
  unregisterActivityButton(id: string): void {
    if (!this.activityButtons.delete(id)) return
    this.emit()
  }

  /** Remueve UNA tab central (handler de 'centerTabs'). */
  unregisterCenterTab(id: PanelId): void {
    if (!this.centerTabs.delete(id)) return
    this.emit()
  }

  /** Remueve todas las contribuciones (y el metadata) de una extensión. */
  unregister(extensionId: string): void {
    const owned = this.ownedBy.get(extensionId) ?? []
    for (const { kind, id } of owned) {
      switch (kind) {
        case 'panel':
          this.panels.delete(id)
          break
        case 'activityBar':
          this.activityButtons.delete(id)
          break
        case 'centerTab':
          this.centerTabs.delete(id)
          break
      }
    }
    this.ownedBy.delete(extensionId)
    this.extensions.delete(extensionId)
    this.emit()
  }
}

export const ExtensionRegistry = new ExtensionRegistryClass()
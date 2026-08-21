/**
 * Sistema de extensiones SEF — tipos.
 *
 * Una extensión es un paquete (builtin compilado en el bundle, o `.sef`
 * instalado por el usuario) con un `manifest.json` que DEFINE TODO de forma
 * declarativa. El loader lee el manifest, resuelve los componentes por ruta
 * y los registra en el ExtensionRegistry — que a su vez alimenta los
 * sistemas ya existentes de la app (layout, activity bar, tabs centrales).
 *
 * Los tipos reutilizan los de la app (`PanelEntry`, `ActivityBarButton`,
 * `SlotId`) para no tener dos verdades sobre un mismo concepto.
 */

import type { ComponentType } from 'react'
import type { PanelId } from '@features/layout'
import type { ThemeContribution } from './types/themes/schema'
import type { LspContribution } from './types/lsp/schema'
import type {
  PanelContribution,
  ActivityBarContribution,
  CenterTabContribution
} from './types'

// ── Manifest (declarativo) ────────────────────────────────────────────────

export interface ExtensionManifest {
  /** Id único de la extensión (kebab-case). */
  id: string
  /** Nombre visible. */
  name: string
  version: string
  author?: string
  description?: string
  /** Versión mínima de la app requerida. */
  engine?: string
  /** Punto de entrada del paquete compilado (.sef). Default: dist/index.js. */
  entry?: string
  /** Contribuciones que aporta la extensión. */
  contributes?: ExtensionContributions
}

export interface ExtensionContributions {
  /** Paneles montables en cualquier slot del layout. */
  panels?: PanelContribution[]
  /** Botones de la activity bar. */
  activityBar?: ActivityBarContribution[]
  /** Tabs del strip central. */
  centerTabs?: CenterTabContribution[]
  /** Temas de color (SEF themes). */
  themes?: ThemeContribution[]
  /** Language servers (SEF lspServers): se registran en el runtime main. */
  lspServers?: LspContribution[]
}

/**
 * Las interfaces de cada contribución viven en el schema de su tipo
 * (`types/<kind>/schema.ts`); acá se re-exportan por compatibilidad.
 */
export type { PanelContribution } from './types/panels/schema'
export type { ActivityBarContribution } from './types/activitybar/schema'
export type { CenterTabContribution } from './types/centertabs/schema'

// ── Registrados (lo que el registry conoce) ───────────────────────────────

export interface RegisteredExtension {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  /** True = compilada dentro del bundle de la app. */
  isBuiltin: boolean
}

/** Tab del strip central de una extensión. */
export interface RegisteredCenterTab {
  id: PanelId
  label: string
  icon?: ComponentType<{ size?: number }>
  /** Panel que monta su contenido en el slot central. */
  panelId: PanelId
}

/** Resolución de componentes del manifest → módulos de la app. */
export interface ComponentResolver {
  /**
   * Devuelve un factory de módulo lazy para una ruta del paquete.
   * El registry lo envuelve con React.lazy; el resolver NO toca React.
   */
  resolveComponent: (path: string) => () => Promise<{ default: ComponentType }>
  /** Devuelve el componente de ícono (eager) para una ruta del paquete. */
  resolveIcon: (path: string) => ComponentType<{ size?: number }> | undefined
  /**
   * True si el paquete exporta un módulo en esa ruta. Lo consume el parse()
   * de cada tipo para descartar contribuciones con módulos faltantes.
   * Opcional: si no está, se asume que todo existe (builtin).
   */
  hasModule?: (path: string) => boolean
}
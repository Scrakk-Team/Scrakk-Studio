// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
import type { FileIconContribution } from './types/fileIcons/schema'
import type { ProductIconContribution } from './types/productIcons/schema'
import type { FileHandlerContribution } from './types/fileHandlers/schema'
import type { ToolContribution } from './types/tools/schema'
import type { SkillContribution } from './types/skills/schema'
import type { EventContribution } from './types/events/schema'
import type { OverlayContribution } from './types/overlays/schema'
import type {
  PanelContribution,
  ActivityBarContribution,
  CenterTabContribution,
  ViewContribution,
  LanguageContribution
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
  /** Versión mínima de la app requerida (verificada al cargar). */
  engine?: string
  /** Permisos declarados — deny-by-default (ver shared/permissions). */
  permissions?: string[]
  /** Punto de entrada del paquete compilado (.sef). Default: dist/index.js. */
  entry?: string
  /**
   * Extensión CON CÓDIGO: el Extension Host carga este entry (Node) y le
   * inyecta el API. Lo escribe el pipeline VSIX al convertir `main`
   * (ver `shared/compatibility/vscode/translators/types/views/views.ts`).
   */
  runtime?: { kind: string; entry: string }
  /** Contribuciones que aporta la extensión. */
  contributes?: ExtensionContributions
  /**
   * Oculta la extensión de la lista de Ajustes → Extensiones. Sigue
   * registrándose igual (sus contribuciones se aplican). Para packs de datos
   * que viajan con la app, como el pack de lenguajes.
   */
  hidden?: boolean
  /**
   * Opt-out explícito del aislamiento de paneles. Solo para paquetes legacy
   * que dependen de hooks del layout; implica ejecutar el bundle en el renderer.
   */
  ui?: { legacyBundle?: boolean }
}

export interface ExtensionContributions {
  /** Paneles montables en cualquier slot del layout. */
  panels?: PanelContribution[]
  /**
   * Vistas de la activity bar cuyo contenido sirve el Extension Host (caso
   * de las extensiones VS Code convertidas: paneles tipo chat con IA).
   */
  views?: ViewContribution[]
  /** Botones de la activity bar. */
  activityBar?: ActivityBarContribution[]
  /** Tabs del strip central. */
  centerTabs?: CenterTabContribution[]
  /**
   * Formatos de archivo propios (SEF `fileHandlers`): cada uno declara qué
   * agarra y cómo se muestra (`view`/`text`/`both`), y entra al MISMO registry
   * que los built-in.
   */
  fileHandlers?: FileHandlerContribution[]
  /** Temas de color (SEF themes). */
  themes?: ThemeContribution[]
  /**
   * Eventos (SEF events): experiencias TEMPORALES con su propia ventana de
   * activación y una coreografía de ops. Se activan por el comando de paleta
   * o solas dentro de la ventana (ver `src/shared/events`).
   */
  events?: EventContribution[]
  /**
   * Overlays: componentes del paquete que el IDE monta en una capa (`effects`
   * encima de todo, `background` detrás de la app). Un evento los elige por id.
   */
  overlays?: OverlayContribution[]
  /** Language servers (SEF lspServers): se registran en el runtime main. */
  lspServers?: LspContribution[]
  /**
   * Kit de lenguaje (SEF `languages`): identidad + asociación de archivos,
   * `language-configuration`, gramáticas (tree-sitter o TextMate), snippets,
   * defaults de editor y mapeo de semantic tokens. Una extensión de lenguaje
   * es UNA contribución con piezas, no cinco contribuciones sueltas.
   */
  languages?: LanguageContribution[]
  /** Temas de iconos de archivos (SEF fileIcons): van al registry global. */
  fileIcons?: FileIconContribution[]
  /** Temas de iconos de producto/UI (SEF productIcons): van al registry global. */
  productIcons?: ProductIconContribution[]
  /**
   * Herramientas de IA (SEF `tools`): se registran en el tool registry global
   * igual que las built-in, con visual propio opcional y ejecución por comando
   * en el Extension Host.
   */
  tools?: ToolContribution[]
  /**
   * Skills (SEF `skills`): paquetes de workflows (estándar Agent Skills) que
   * aporta la extensión, con su `SKILL.md` adentro del paquete.
   */
  skills?: SkillContribution[]
}

/**
 * Las interfaces de cada contribución viven en el schema de su tipo
 * (`types/<kind>/schema.ts`); aquí se re-exportan por compatibilidad.
 */
export type { PanelContribution } from './types/panels/schema'
export type { ViewContribution } from './types/views/schema'
export type { ActivityBarContribution } from './types/activitybar/schema'
export type { CenterTabContribution } from './types/centertabs/schema'
export type { FileHandlerContribution } from './types/fileHandlers/schema'
export type { LanguageContribution } from './types/languages/schema'

// ── Registrados (lo que el registry conoce) ───────────────────────────────

export interface RegisteredExtension {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  /** True = compilada dentro del bundle de la app. */
  isBuiltin: boolean
  /** No se lista en Ajustes → Extensiones (packs de datos internos). */
  hidden?: boolean
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
   * Devuelve un factory de MÓDULO para una ruta del paquete.
   *
   * Ojo: el factory es un `import()` crudo, NO un componente `React.lazy`.
   * Quien arma un `PanelEntry` lo pasa por `panelComponentLoader()`, que lo
   * adapta al contrato del layout (`load`) sin tocar React aquí.
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

/**
 * `load` de un `PanelEntry` a partir de una ruta del paquete de la extensión.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO `React.lazy` (el bug de "el panel no carga hasta que lo abro de nuevo")
 *
 * El `PanelHost` del layout NO tiene Suspense. Un componente `lazy` montado sin
 * boundary que suspende deja la pantalla COMO ESTABA y React no reintenta
 * cuando el módulo llega: el panel aparece recién en el próximo montaje (abrir
 * otro panel y volver) — porque ahí el módulo ya está evaluado y el `lazy`
 * resuelve en el acto. Es el mismo motivo por el que los paneles built-in y
 * `ExtensionViewPanelLoader` usan import dinámico a mano.
 *
 * Ver `features/layout/components/PanelHost/panelModules.ts` (mediciones).
 */
export function panelComponentLoader(
  resolver: ComponentResolver,
  path: string
): () => Promise<ComponentType> {
  return () => resolver.resolveComponent(path)().then((module) => module.default)
}
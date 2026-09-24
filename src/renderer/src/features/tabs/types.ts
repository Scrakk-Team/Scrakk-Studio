// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ComponentType } from 'react'

/**
 * Sistema de tabs — API pública.
 *
 * Cualquier componente (feature o extensión) puede spawnear una tab con el
 * contenido, etiqueta e ícono que quiera. Las tabs viven en "strips"
 * (identificados por un string); el layout usa los ids de sus slots
 * ('left' | 'center' | 'right' | 'bottom') como strips, pero la API es
 * genérica: cualquier zona con un TabStrip puede recibir tabs.
 */

/** Qué tipo de contenido monta la tab. */
export type TabKind = 'welcome' | 'panel' | 'file' | 'terminal' | 'explorer'

/**
 * Especificación de una tab. Se construye con helpers tipados
 * (createPanelTab / createFileTab / createTerminalTab / WELCOME_TAB) o
 * directamente con un objeto plano.
 */
export interface TabSpec {
  /** Id único de la tab (por convención `file:<path>`, `panel:<id>`, `term:<id>`). */
  id: string
  kind: TabKind
  /** Etiqueta visible. Si falta, TabStrip usa el default del kind. */
  label?: string
  /** Ícono opcional (solo decorativo: se muestra antes del label). */
  icon?: ComponentType<{ size?: number }>
  /** Panel registrado a montar (kind 'panel'; 'welcome' usa panelId 'welcome'). */
  panelId?: string
  /** Ruta del archivo (kind 'file'). */
  filePath?: string
  /** Id de sesión viva (kind 'terminal'). */
  sessionId?: string
  /** Raíz a mostrar (kind 'explorer'): una instancia del explorador por carpeta. */
  rootPath?: string
  /** Botón de cierre (X). Default: true. Las tabs fijas no tienen X. */
  closable?: boolean
  /** Fija: sin X y no se arrastra (Bienvenida). */
  fixed?: boolean
  /**
   * Candidata a persistir en el layout. Default por kind: panel/terminal
   * true, file true salvo en el centro (allí deriva de editorBus), welcome false.
   */
  persist?: boolean
}

/** Id de un strip de tabs (en el layout, coincide con el SlotId). */
export type StripId = string

export interface StripState {
  stripId: StripId
  tabs: TabSpec[]
  /** Id de la tab activa (null si el strip está vacío). */
  activeId: string | null
  /**
   * Contenido DIVIDIDO (estilo split) de la strip: el strip es UNA sola
   * barra compartida de tabs (la dueña con su cadena ⇄) y debajo el
   * contenido muestra UN PANEL POR TAB (Chat | Terminal), separados por el
   * ResizeHandle cuadrado. undefined = contenido clásico (solo la activa).
   * 'row' = paneles lado a lado; 'column' = apilados.
   */
  splitDir?: 'row' | 'column'
}

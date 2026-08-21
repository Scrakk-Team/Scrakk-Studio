import type { ComponentType, LazyExoticComponent } from 'react'

/**
 * Identificador de un panel registrado en el sistema de layouts.
 * Los built-in son 'chat' | 'history' | 'welcome' | 'explorer'; las
 * extensiones registran paneles con ids propios en runtime.
 */
export type PanelId = string

/**
 * Slots del layout. El sistema es modular tipo VS Code: CUALQUIER panel
 * registrado puede montarse en CUALQUIER slot (nada hardcodeado).
 */
export type SlotId = 'left' | 'center' | 'right'

/** Entrada del registro de paneles. */
export interface PanelEntry {
  id: PanelId
  /** Título mostrado en el header del panel. */
  title: string
  /** Componente cargado de forma perezosa (lazy) desde su propio módulo. */
  component: LazyExoticComponent<ComponentType>
  /** Si el panel se puede cerrar (X en el header). Default: true. */
  closable?: boolean
}

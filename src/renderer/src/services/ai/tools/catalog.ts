/**
 * Catálogo de tools — Familias y Tipos.
 *
 * La metadata de agrupación NO está hardcodeada en un union: vive acá y es
 * **extensible**. Cada tool declara su `type` (un ToolType) y los ToolType
 * pertenecen a una ToolFamily. Las extensiones `.sef` pueden registrar su
 * propio pack (familia) y tipos.
 *
 *   Family (Entorno | Agénticos | Extensiones | …)
 *     └─ Type (Archivos, Código, … | Subagentes | …)
 *          └─ Tool
 *
 * Mismo patrón de registry (register/list/subscribe) que modes/comandos.
 */

import type { Tool } from './types'

export interface ToolFamily {
  id: string
  label: string
  description?: string
  /** Id de productIcon. */
  icon?: string
  order: number
}

export interface ToolType {
  id: string
  label: string
  description?: string
  icon?: string
  order: number
  /** Id de la ToolFamily a la que pertenece. */
  family: string
}

type Listener = () => void

class ToolCatalog {
  private families = new Map<string, ToolFamily>()
  private types = new Map<string, ToolType>()
  private listeners = new Set<Listener>()

  registerFamily(family: ToolFamily): void {
    const current = this.families.get(family.id)
    this.families.set(family.id, current ? { ...current, ...family } : family)
    this.emit()
  }

  registerType(type: ToolType): void {
    const current = this.types.get(type.id)
    this.types.set(type.id, current ? { ...current, ...type } : type)
    this.emit()
  }

  /**
   * Garantiza que exista un tipo (lo crea si no está). Lo usan las extensiones
   * para declarar su propio pack sin registrarlo aparte.
   */
  ensureType(input: {
    id: string
    label?: string
    family?: string
    icon?: string
    order?: number
  }): ToolType {
    const current = this.types.get(input.id)
    if (current) return current
    const type: ToolType = {
      id: input.id,
      label: input.label ?? input.id,
      family: input.family ?? EXTENSIONS_FAMILY,
      icon: input.icon,
      order: input.order ?? 100
    }
    this.registerType(type)
    return type
  }

  getFamily(id: string): ToolFamily | undefined {
    return this.families.get(id)
  }

  getType(id: string): ToolType | undefined {
    return this.types.get(id)
  }

  listFamilies(): ToolFamily[] {
    return [...this.families.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }

  listTypes(family?: string): ToolType[] {
    const all = [...this.types.values()]
    const filtered = family ? all.filter((type) => type.family === family) : all
    return filtered.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }

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
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }
}

export const toolCatalog = new ToolCatalog()

// ── Familias built-in ───────────────────────────────────────────────────────

export const ENVIRONMENT_FAMILY = 'environment'
export const AGENTIC_FAMILY = 'agentic'
export const EXTENSIONS_FAMILY = 'extensions'

toolCatalog.registerFamily({
  id: ENVIRONMENT_FAMILY,
  label: 'Entorno',
  description: 'Herramientas de archivos, código y sistema.',
  icon: 'folder',
  order: 0
})
toolCatalog.registerFamily({
  id: AGENTIC_FAMILY,
  label: 'Agénticos',
  description: 'Subagentes y herramientas de agente.',
  icon: 'people',
  order: 1
})
toolCatalog.registerFamily({
  id: EXTENSIONS_FAMILY,
  label: 'Extensiones',
  description: 'Herramientas aportadas por extensiones.',
  icon: 'extensions',
  order: 2
})

// ── Tipos built-in ──────────────────────────────────────────────────────────

export const DEFAULT_TOOL_TYPE = 'utility'
export const EXTENSION_TOOL_TYPE = 'extension'
export const SUBAGENT_TOOL_TYPE = 'subagent'

const BUILTIN_TYPES: ToolType[] = [
  { id: 'file', label: 'Archivos', family: ENVIRONMENT_FAMILY, order: 0, icon: 'file' },
  { id: 'code', label: 'Código', family: ENVIRONMENT_FAMILY, order: 1, icon: 'code' },
  { id: 'system', label: 'Sistema', family: ENVIRONMENT_FAMILY, order: 2, icon: 'terminal' },
  { id: 'browser', label: 'Navegador', family: ENVIRONMENT_FAMILY, order: 3, icon: 'globe' },
  { id: 'skills', label: 'Skills', family: ENVIRONMENT_FAMILY, order: 4, icon: 'layers' },
  { id: DEFAULT_TOOL_TYPE, label: 'Utilidades', family: ENVIRONMENT_FAMILY, order: 5, icon: 'grid' },
  { id: SUBAGENT_TOOL_TYPE, label: 'Subagentes', family: AGENTIC_FAMILY, order: 0, icon: 'people' },
  { id: EXTENSION_TOOL_TYPE, label: 'Extensiones', family: EXTENSIONS_FAMILY, order: 0, icon: 'extensions' }
]

for (const type of BUILTIN_TYPES) toolCatalog.registerType(type)

/** Tipo de una tool (o el default si no declara). */
export function toolTypeOf(tool: Tool): string {
  return tool.meta?.type || DEFAULT_TOOL_TYPE
}

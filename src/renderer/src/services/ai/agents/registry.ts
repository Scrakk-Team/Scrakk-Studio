/**
 * Registry de agentes — fuente en memoria, agnóstica del storage.
 *
 * Mantiene dos colecciones separadas (primarios / subagentes) pero busca en
 * ambas por id, porque un agente puede ser `mode: 'all'`. El storage
 * (`.scrakk/agents/*.json`) lo llena `settings.ts`.
 */

import type { AgentEntry, AgentProfile } from './types'

type Listener = () => void

class AgentRegistry {
  private primaries = new Map<string, AgentProfile>()
  private subagents = new Map<string, AgentProfile>()
  private listeners = new Set<Listener>()

  clear(): void {
    this.primaries.clear()
    this.subagents.clear()
    this.emit()
  }

  register(profile: AgentProfile): void {
    if (profile.mode === 'subagent') {
      this.subagents.set(profile.id, profile)
    } else if (profile.mode === 'primary') {
      this.primaries.set(profile.id, profile)
    } else {
      // 'all': disponible en ambos lados.
      this.primaries.set(profile.id, profile)
      this.subagents.set(profile.id, profile)
    }
    this.emit()
  }

  unregister(id: string): void {
    const a = this.primaries.delete(id)
    const b = this.subagents.delete(id)
    if (a || b) this.emit()
  }

  /** Busca en ambos lados (primarios primero). */
  get(id: string): AgentProfile | undefined {
    return this.primaries.get(id) ?? this.subagents.get(id)
  }

  getPrimary(id: string): AgentProfile | undefined {
    return this.primaries.get(id)
  }

  getSubagent(id: string): AgentProfile | undefined {
    return this.subagents.get(id)
  }

  listPrimaries(): AgentProfile[] {
    return [...this.primaries.values()]
  }

  listSubagents(): AgentProfile[] {
    return [...this.subagents.values()]
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

export const agentRegistry = new AgentRegistry()

/** Ids de subagentes habilitados para un primario (o [] si no hay). */
export function enabledSubagentIds(primaryId: string | null | undefined): string[] {
  if (!primaryId) return []
  return agentRegistry.getPrimary(primaryId)?.subagents ?? []
}

/** Perfiles de subagentes habilitados para un primario. */
export function enabledSubagents(primaryId: string | null | undefined): AgentProfile[] {
  return enabledSubagentIds(primaryId)
    .map((id) => agentRegistry.getSubagent(id))
    .filter((agent): agent is AgentProfile => agent !== undefined)
}

/**
 * Subagentes disponibles para el modo/agente activo:
 * - Si el id corresponde a un agente primario propio → los que declara.
 * - Si es un modo integrado (default/plan/…) → TODOS los subagentes (para que
 *   el feature funcione out-of-the-box sin tocar los builtins).
 */
export function subagentsForMode(modeId: string | null | undefined): AgentProfile[] {
  const primary = modeId ? agentRegistry.getPrimary(modeId) : undefined
  if (primary) return enabledSubagents(modeId)
  return agentRegistry.listSubagents()
}

export type { AgentEntry }

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Eventos SEF — el HANDLER del tipo de contribución `events`.
 *
 * Igual que `themes`: `parse` valida el slice del manifest, `register` resuelve
 * la escena (inline o leyendo un JSON del paquete) y la deja en el registro.
 * El runtime (`@services/events`) es quien la activa.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import { parseEventContributions, normalizeEventScene, type EventContribution } from './schema'
import { registerEvent, unregisterEvent } from './logic'

interface RegisteredEventRef {
  id: string
}

export const eventsHandler: AnyExtensionTypeHandler = {
  kind: 'events',

  parse(raw, ctx): EventContribution[] | null {
    return parseEventContributions(raw, ctx)
  },

  async register(
    contribution: EventContribution,
    ctx: ExtensionTypeContext
  ): Promise<RegisteredEventRef | null> {
    let rawScene: unknown = contribution.scene ?? null

    if (contribution.path) {
      const content = await ctx.readFile(contribution.path)
      if (content === null) {
        console.warn(
          `[extensions/events] "${contribution.id}": no se pudo leer "${contribution.path}"`
        )
        return null
      }
      try {
        rawScene = JSON.parse(content)
      } catch (error) {
        console.warn(`[extensions/events] "${contribution.id}" JSON inválido:`, error)
        return null
      }
    }

    const scene = normalizeEventScene(rawScene)
    if (!scene) {
      console.warn(`[extensions/events] "${contribution.id}": escena inválida, no se registra`)
      return null
    }

    registerEvent({
      id: contribution.id,
      name: contribution.name,
      extensionId: ctx.extensionId,
      isBuiltin: ctx.isBuiltin,
      scene
    })

    return { id: contribution.id }
  },

  unregister(owned: RegisteredEventRef[]) {
    for (const ref of owned) unregisterEvent(ref.id)
  }
}

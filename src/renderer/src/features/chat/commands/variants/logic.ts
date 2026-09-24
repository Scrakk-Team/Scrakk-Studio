// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Lógica del comando `/variants`.
 *
 * Lee el modelo activo y sus variantes de razonamiento del catálogo
 * (models.dev) y ofrece elegirlas con la UI propia del sistema de comandos
 * (un modal de opciones), no con texto en el chat.
 */

import { getProvider } from '@services/providers'
import { showOptionModal } from '@services/modals'
import { thinkingOptionsFor } from '@shared/thinking'
import type { SlashCommandResult } from '@services/slash-commands'
import { activeProviderSelection, readProviderSettings, setProviderVariant } from '@features/providers/settings'

export interface VariantInfo {
  providerId: string | null
  model: string
  /** Valores válidos (ej. low/high/max, off/on, low/medium/high). */
  options: string[]
  /** Variante elegida actualmente ('' = automática). */
  current: string
  /** El catálogo todavía no cargó el proveedor (no hay metadata). */
  catalogReady: boolean
}

/** Variantes disponibles para el modelo activo. */
export function getAvailableVariants(): VariantInfo {
  const { providerId, model } = activeProviderSelection()
  if (!providerId) {
    return { providerId: null, model: '', options: [], current: '', catalogReady: false }
  }
  const provider = getProvider(providerId)
  if (!provider) {
    return { providerId, model, options: [], current: '', catalogReady: false }
  }
  // El id guardado puede ser viejo/ inválido: se valida contra el catálogo y
  // si no está se usa el default (mismo criterio que `getModel`).
  const resolvedModel =
    model && provider.models.includes(model) ? model : provider.defaultModel
  const reasoning = provider.reasoning?.[resolvedModel]

  let options: string[] = []
  if (reasoning?.effort && reasoning.effort.length > 0) {
    options = [...reasoning.effort]
  } else if (reasoning?.toggle) {
    options = ['off', 'on']
  } else if (provider.reasoning) {
    // El proveedor declara variantes pero este modelo no: no se inventan.
    options = []
  } else {
    // Sin metadata en el catálogo: fallback a la heurística por familia.
    options = thinkingOptionsFor(resolvedModel).filter((mode) => mode !== 'auto')
    if (options.length === 1 && options[0] === 'on') options = ['off', 'on']
  }

  const current = readProviderSettings().variants[providerId] ?? ''
  return { providerId, model: resolvedModel, options, current, catalogReady: true }
}

/** Aplica (o restablece) la variante del modelo activo. */
export function applyVariant(value: string): SlashCommandResult {
  const info = getAvailableVariants()
  if (!info.providerId) return { ok: false, error: 'No hay proveedor activo' }
  if (!info.catalogReady) return { ok: false, error: 'El catálogo de modelos todavía no cargó' }
  if (info.options.length === 0) {
    return { ok: false, error: `El modelo ${info.model} no declara variantes de razonamiento` }
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'auto' || normalized === 'default') {
    setProviderVariant(info.providerId, null)
    return { ok: true, message: `Variante de ${info.model}: automática.` }
  }
  if (!info.options.includes(normalized)) {
    return {
      ok: false,
      error: `Valor inválido "${value}". Opciones: ${info.options.join(', ')}`
    }
  }
  setProviderVariant(info.providerId, normalized)
  return { ok: true, message: `Variante de ${info.model}: ${normalized}.` }
}

/**
 * Abre el selector de variantes (UI propia del comando): modal de opciones con
 * las variantes del modelo; al elegir, se aplica.
 */
export async function openVariantsPicker(): Promise<SlashCommandResult> {
  const info = getAvailableVariants()
  if (!info.providerId) return { ok: false, error: 'No hay proveedor activo' }
  if (!info.catalogReady) {
    return { ok: false, error: 'El catálogo de modelos todavía no cargó; espera un segundo.' }
  }
  if (info.options.length === 0) {
    return {
      ok: true,
      message: `El modelo ${info.model} no declara variantes de razonamiento.`
    }
  }

  const items = [
    {
      id: 'auto',
      label: 'Automática',
      description: 'No forzar effort (default del proveedor)',
      hint: info.current ? '' : 'actual'
    },
    ...info.options.map((value) => ({
      id: value,
      label: value,
      description: undefined,
      hint: info.current === value ? 'actual' : ''
    }))
  ]

  const chosen = await showOptionModal({ title: `Variantes · ${info.model}`, items })
  if (!chosen) return { ok: true, ui: true }
  const result = applyVariant(chosen)
  return result.ok ? { ...result, ui: true } : result
}

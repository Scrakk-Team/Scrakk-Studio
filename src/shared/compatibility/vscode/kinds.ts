// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Capa 2 — Detección del TIPO de extensión.
 *
 * Antes de convertir, se clasifica QUÉ trae el .vsix: cada key de
 * `contributes` se mapea a un estado honesto:
 * - `supported`: hay traductor a SEF.
 * - `pending`: tipo real pero sin traductor aún. Se reporta con el motivo.
 * - `unsupported`: no hay equivalente en Scrakk.
 *
 * ── DE DÓNDE SALE ESTA TABLA ─────────────────────────────────────────────
 * Ya NO es una lista propia: `KIND_TABLE` es una PROYECCIÓN de la tabla única
 * de superficie (`shared/compatibility/surface/`). Era el punto donde antes
 * había dos verdades — esta y el shim del host — y podían divergir. Cambiar
 * el estado de un tipo es cambiar UNA entrada allá; aquí no se edita nada.
 */

import { getSurfaceNamespace, kindSupportOf } from '../surface'
import type { KindSupport } from '../surface'

export type { KindSupport }

export interface KindStatus {
  /** Key de contributes (ej 'productIconThemes') o 'code'. */
  key: string
  /** Nombre humano para la UI. */
  label: string
  /** Cuántos aporta (temas, snippets, comandos…). */
  count: number
  support: KindSupport
  /** A qué kind SEF se traduce (solo si supported). */
  sefKind?: string
  /** Motivo legible (solo si pending/unsupported). */
  reason?: string
}

interface KindSpec {
  label: string
  support: KindSupport
  sefKind?: string
  reason?: string
}

/** Proyección de la tabla de superficie: una sola verdad, sin duplicar. */
function buildKindTable(): Record<string, KindSpec> {
  const namespace = getSurfaceNamespace('contributes')
  const out: Record<string, KindSpec> = {}
  for (const entry of namespace?.apis ?? []) {
    const spec: KindSpec = {
      label: entry.label,
      support: kindSupportOf(entry.status)
    }
    if (entry.route === 'sef' && entry.native) spec.sefKind = entry.native
    if (entry.status !== 'real') {
      const reason = entry.degradation ?? entry.note
      if (reason) spec.reason = reason
    }
    out[entry.key] = spec
  }
  return out
}

/** Tabla de verdad: todo contributes.* conocido de VS Code. */
export const KIND_TABLE: Record<string, KindSpec> = buildKindTable()

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return value != null ? 1 : 0
}

/** Clasifica cada contribution point del manifest + el código (main). */
export function detectKinds(manifest: {
  contributes?: Record<string, unknown>
  main?: string
  browser?: string
}): KindStatus[] {
  const out: KindStatus[] = []
  const contributes = manifest.contributes ?? {}

  for (const [key, value] of Object.entries(contributes)) {
    const count = countOf(value)
    if (count === 0) continue
    const spec = KIND_TABLE[key]
    if (spec) {
      out.push({
        key,
        label: spec.label,
        count,
        support: spec.support,
        sefKind: spec.sefKind,
        reason: spec.reason
      })
    } else {
      out.push({
        key,
        label: `Contribución "${key}"`,
        count,
        support: 'unsupported',
        reason: 'contribution point desconocido: sin mapeo a SEF'
      })
    }
  }

  if (manifest.main) {
    const spec = KIND_TABLE['code']
    out.push({
      key: 'code',
      label: spec?.label ?? 'Código de la extensión (main → Extension Host)',
      count: 1,
      // El entry Node se copia al paquete y corre en el Extension Host.
      support: spec?.support ?? 'supported'
    })
  }

  if (manifest.browser) {
    const spec = KIND_TABLE['code.browser']
    out.push({
      key: 'code.browser',
      label: spec?.label ?? 'Web extension (browser)',
      count: 1,
      support: spec?.support ?? 'unsupported',
      reason: spec?.reason ?? 'el Extension Host todavía no ejecuta web extensions (`browser`)'
    })
  }

  return out
}

/** Resumen de una línea para errores y logs. */
export function describeKinds(kinds: KindStatus[]): string {
  return kinds.map((k) => `${k.label} ×${k.count} (${k.support})`).join('; ')
}

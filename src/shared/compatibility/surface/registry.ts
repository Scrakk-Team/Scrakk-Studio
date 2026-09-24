// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Registry de la tabla de superficie — carga, valida y verifica.
 *
 * Igual que jokit: el core no sabe de ningún framework/API concreta; solo lee
 * los namespaces, valida el contrato y ofrece getters. Agregar cobertura =
 * agregar/editar entradas, nunca tocar este archivo.
 *
 * ── LAS DOS VERIFICACIONES QUE MANTIENEN LA TABLA HONESTA ────────────────
 *
 *  1. `auditApi(api)` recorre el módulo `vscode` EN RUNTIME y devuelve lo que
 *     existe sin estar declarado. Si alguien agrega un API al host y no lo
 *     declara, el test falla y dice el nombre exacto.
 *  2. `missingFromApi(api)` hace lo inverso: lo declarado como `real` tiene
 *     que existir de verdad. Si alguien borra o rompe un API, el test falla.
 *
 * Sin esas dos, la tabla sería documentación que envejece sola.
 */

import { API_NAMESPACES } from './namespaces/api'
import { contributesNamespace } from './namespaces/contributes'
import type { SurfaceEntry, SurfaceNamespace, SurfaceRoute, SurfaceStatus } from './types'
import { SUPPORT_BY_STATUS } from './types'

/** Namespace del lado VSIX primero: es el que ve el usuario al instalar. */
export const SURFACE: SurfaceNamespace[] = [contributesNamespace, ...API_NAMESPACES]

const BY_ID = new Map(SURFACE.map((namespace) => [namespace.id, namespace]))

export function listSurfaceNamespaces(): SurfaceNamespace[] {
  return SURFACE
}

export function getSurfaceNamespace(id: string): SurfaceNamespace | null {
  return BY_ID.get(id) ?? null
}

export interface SurfaceRef {
  namespace: string
  entry: SurfaceEntry
}

/** Todas las entradas con su namespace (orden estable). */
export function allSurfaceEntries(): SurfaceRef[] {
  return SURFACE.flatMap((namespace) =>
    namespace.apis.map((entry) => ({ namespace: namespace.id, entry }))
  )
}

/** Busca por clave completa: `window.showQuickPick`, `contributes.themes`. */
export function findSurfaceEntry(path: string): SurfaceRef | null {
  const dot = path.indexOf('.')
  if (dot <= 0) return null
  const namespace = getSurfaceNamespace(path.slice(0, dot))
  if (!namespace) return null
  const key = path.slice(dot + 1)
  const entry = namespace.apis.find((api) => api.key === key || api.covers?.includes(key))
  return entry ? { namespace: namespace.id, entry } : null
}

// ── Validación del contrato ────────────────────────────────────────────────

/**
 * Devuelve los problemas del contrato (vacío = tabla sana). Se corre en los
 * tests y en dev, para que una entrada mal escrita no llegue a producción.
 */
export function validateSurface(namespaces: SurfaceNamespace[] = SURFACE): string[] {
  const problems: string[] = []

  for (const namespace of namespaces) {
    const seen = new Set<string>()
    for (const entry of namespace.apis) {
      const where = `${namespace.id}.${entry.key}`
      if (!entry.key) problems.push(`${namespace.id}: entrada sin key`)
      if (!entry.label) problems.push(`${where}: sin label`)
      if (seen.has(entry.key)) problems.push(`${where}: key duplicada`)
      seen.add(entry.key)

      if (entry.route === 'sef' && !entry.native) {
        problems.push(`${where}: ruta 'sef' sin kind SEF (native)`)
      }
      if (entry.status !== 'real') {
        if (!entry.degradation) {
          problems.push(`${where}: estado '${entry.status}' sin explicar qué pasa en su lugar`)
        }
        if (entry.route === 'none' && entry.native) {
          problems.push(`${where}: ruta 'none' no puede tener native`)
        }
      }
      if (entry.covers && entry.covers.length === 0) {
        problems.push(`${where}: covers vacío (¿grupo sin miembros?)`)
      }
    }
  }

  return problems
}

// ── Cobertura (lo que consumen la UI y el reporte de instalación) ──────────

export interface NamespaceCoverage {
  id: string
  label: string
  total: number
  byStatus: Record<SurfaceStatus, number>
  byRoute: Record<SurfaceRoute, number>
  /** Entradas que no están `real`, con su motivo (lo que hay que contar). */
  gaps: Array<{ key: string; label: string; status: SurfaceStatus; why: string }>
  /** 0..1 — proporción de la superficie que ya es `real`. */
  score: number
}

export function coverageOf(namespace: SurfaceNamespace): NamespaceCoverage {
  const byStatus: Record<SurfaceStatus, number> = { real: 0, partial: 0, inert: 0, missing: 0 }
  const byRoute: Record<SurfaceRoute, number> = { sef: 0, host: 0, none: 0 }
  const gaps: NamespaceCoverage['gaps'] = []

  for (const entry of namespace.apis) {
    byStatus[entry.status] += 1
    byRoute[entry.route] += 1
    if (entry.status !== 'real') {
      gaps.push({
        key: entry.key,
        label: entry.label,
        status: entry.status,
        why: entry.degradation ?? entry.note ?? 'sin motivo declarado'
      })
    }
  }

  const total = namespace.apis.length
  return {
    id: namespace.id,
    label: namespace.label,
    total,
    byStatus,
    byRoute,
    gaps,
    score: total === 0 ? 0 : byStatus.real / total
  }
}

export function coverageReport(
  namespaces: SurfaceNamespace[] = SURFACE
): NamespaceCoverage[] {
  return namespaces.map(coverageOf)
}

/** Resumen de una línea (logs y reporte de instalación). */
export function describeCoverage(namespaces: SurfaceNamespace[] = SURFACE): string {
  return coverageReport(namespaces)
    .map((entry) => `${entry.id} ${entry.byStatus.real}/${entry.total}`)
    .join('; ')
}

/** Apoyo para `kinds.ts`: los dos son la misma verdad, expresada distinto. */
export function kindSupportOf(status: SurfaceStatus): (typeof SUPPORT_BY_STATUS)[SurfaceStatus] {
  return SUPPORT_BY_STATUS[status]
}

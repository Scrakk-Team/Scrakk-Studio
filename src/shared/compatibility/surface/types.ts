// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * TABLA ÚNICA de la capa de compatibilidad — tipos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * Antes había dos listas que podían divergir: `kinds.ts` (qué contribution
 * points del .vsix se traducen) y el shim del host (qué API existe en
 * runtime). Una decía "supported" y la otra fallaba en silencio.
 *
 * Aquí hay UNA entrada por pieza, con su ruta declarada:
 *
 *   route: 'sef'   → se TRADUCE a un kind SEF. Cero runtime, se ve nativo.
 *   route: 'host'  → se EMULA corriendo el código de la extensión.
 *   route: 'none'  → no hay equivalente: se reporta con motivo, nunca muda.
 *
 * La regla de oro (la misma de jokit): nada se finge. Si el estado no es
 * `real`, la entrada DEBE decir qué ve el usuario en su lugar
 * (`degradation`), y hay tests que verifican la tabla contra el runtime en
 * los dos sentidos.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Por dónde entra una pieza de la compatibilidad. */
export type SurfaceRoute =
  /** Traducida a un kind SEF (data). */
  | 'sef'
  /** Emulada en el Extension Host (código). */
  | 'host'
  /** Sin equivalente en Scrakk. */
  | 'none'

/**
 * Qué tan real es hoy.
 *  - real:   funciona y hace lo que promete.
 *  - partial: funciona, pero le falta una parte (y se dice cuál).
 *  - inert:  existe para que el código no reviente; no tiene efecto.
 *  - missing: no existe; llamarlo da un error claro.
 */
export type SurfaceStatus = 'real' | 'partial' | 'inert' | 'missing'

export interface SurfaceEntry {
  /**
   * Clave estable dentro del namespace. Los grupos abiertos (clases de
   * datos, enums) usan comodín: `*.dataClasses`. Hay un límite de comodines
   * por namespace para que la tabla no se vuelva una excusa.
   */
  key: string
  /** Nombre humano (lo ve el usuario en el reporte de compatibilidad). */
  label: string
  route: SurfaceRoute
  status: SurfaceStatus
  /** A dónde va cuando hay ruta: kind SEF (`themes`) o pieza de Scrakk. */
  native?: string
  /**
   * Nombres que cubre esta entrada (grupos como `dataClasses.*`). El audit
   * los expande nombre por nombre, así agrupar no afloja la verificación.
   */
  covers?: string[]
  /** Qué ve el usuario/la extensión cuando NO es `real`. Obligatorio si status !== 'real'. */
  degradation?: string
  /** Detalle técnico para quien lee el código. */
  note?: string
}

export interface SurfaceNamespace {
  /** Id: `contributes`, `window`, `workspace`… */
  id: string
  /** Descripción corta para docs/UI. */
  label: string
  apis: SurfaceEntry[]
}

/** Proyección a `kinds.ts`: cómo se reporta cada estado al usuario. */
export type KindSupport = 'supported' | 'pending' | 'unsupported'

export const SUPPORT_BY_STATUS: Record<SurfaceStatus, KindSupport> = {
  real: 'supported',
  partial: 'pending',
  inert: 'unsupported',
  missing: 'unsupported'
}

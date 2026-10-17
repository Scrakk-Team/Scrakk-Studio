// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Límite de intentos en memoria (puro, testeable).
 *
 * La API de auth es externa (`api.scrakk.art`), así que no podemos verificar
 * desde el repo si limita el OTP. El cliente pone su propia barrera: como
 * mínimo un proceso local no puede pedir códigos en bucle (email bombing) ni
 * probar los 6 dígitos a fuerza bruta.
 *
 * Es por proceso y por email; reiniciar la app lo resetea. El límite real
 * tiene que vivir también en el servidor.
 */

export interface LimitResult {
  allowed: boolean
  /** Milisegundos hasta que se libere un slot (0 si está permitido). */
  retryAfterMs: number
}

export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly now: () => number = Date.now) {}

  /** Registra un intento si queda cupo en la ventana; si no, lo rechaza. */
  hit(key: string, limit: number, windowMs: number): LimitResult {
    const current = this.now()
    const recent = (this.hits.get(key) ?? []).filter((at) => current - at < windowMs)
    if (recent.length >= limit) {
      const oldest = recent[0] ?? current
      return {
        allowed: false,
        retryAfterMs: Math.max(0, windowMs - (current - oldest))
      }
    }
    recent.push(current)
    this.hits.set(key, recent)
    // Poda barata: sin esto un atacante podría inflar el mapa con emails.
    if (this.hits.size > 5_000) this.prune(windowMs)
    return { allowed: true, retryAfterMs: 0 }
  }

  reset(key: string): void {
    this.hits.delete(key)
  }

  private prune(windowMs: number): void {
    const current = this.now()
    for (const [key, values] of this.hits) {
      if (values.every((at) => current - at >= windowMs)) this.hits.delete(key)
    }
  }
}

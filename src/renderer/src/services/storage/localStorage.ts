// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Motor de bajo nivel sobre window.localStorage.
 *
 * Abstrae el acceso crudo a la Web Storage API con try/catch controlado
 * (localStorage puede fallar en modo privado o sin cuota disponible).
 * No contiene lógica de negocio: solo get / set / remove / clear.
 */

const PREFIX = 'scrakk:'

function prefixedKey(k: string): string {
  return PREFIX + k
}

export function lsGet<T>(k: string): T | null {
  try {
    const raw = window.localStorage.getItem(prefixedKey(k))
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function lsSet<T>(k: string, value: T): void {
  try {
    window.localStorage.setItem(prefixedKey(k), JSON.stringify(value))
  } catch {
    // localStorage lleno o no disponible — se ignora silenciosamente.
  }
}

export function lsRemove(k: string): void {
  try {
    window.localStorage.removeItem(prefixedKey(k))
  } catch {
    /* noop */
  }
}

export function lsClear(): void {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const raw = window.localStorage.key(i)
      if (raw && raw.startsWith(PREFIX)) toRemove.push(raw)
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    /* noop */
  }
}

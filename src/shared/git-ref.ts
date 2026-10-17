// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Validación de refs/revisiones de git (puro, testeable).
 *
 * Vive aparte del IPC porque el proceso main importa Electron y este módulo lo
 * usan los tests. La regla de oro: **nada que empiece por `-` llega a git**.
 * Un nombre de rama así se interpreta como opción y `--output=<ruta>` permite
 * escribir un archivo arbitrario (p. ej. `~/.bashrc`) desde un repo clonado.
 */

/** Nombres git seguros (sin `-` inicial, controles ni sintaxis de revisión). */
export function isSafeRefName(name: string): boolean {
  if (typeof name !== 'string' || !name || name.length > 200) return false
  if (name.startsWith('-') || name.startsWith('.')) return false
  if (/[\x00-\x20~^:?*\[\\@{]|\.\.|\/$/.test(name)) return false
  return true
}

/** Revisión aceptada en `log`/`diff`/`checkout`: SHA, `HEAD` o ref válido. */
export function isSafeRevision(rev: string): boolean {
  if (typeof rev !== 'string' || !rev || rev.length > 200) return false
  if (rev === 'HEAD') return true
  if (/^[0-9a-f]{4,40}$/i.test(rev)) return true
  return isSafeRefName(rev)
}

/** Igual que `isSafeRevision`, pero admite un rango `A..B` / `A...B`. */
export function isSafeDiffRef(rev: string): boolean {
  if (typeof rev !== 'string' || !rev || rev.length > 200) return false
  const parts = rev.split(/\.\.\.?/)
  if (parts.length === 1) return isSafeRevision(rev)
  if (parts.length !== 2) return false
  return parts.every((part) => part.length > 0 && isSafeRevision(part))
}

/** Nombres de remoto seguros (`origin`, `upstream`, …). */
export function isSafeRemoteName(name: string): boolean {
  return typeof name === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(name)
}

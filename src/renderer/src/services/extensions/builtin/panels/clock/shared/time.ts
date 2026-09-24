// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Helpers de tiempo compartidos por la extensión Clock.
 * Los archivos de `shared/` son internos del paquete.
 */

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('es', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
}
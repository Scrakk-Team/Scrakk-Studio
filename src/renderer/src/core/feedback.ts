// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * feedback — tiempos compartidos de la UI de carga.
 *
 * Un loader que aparece y desaparece en pocos frames PARPADEA: se percibe como
 * un fallo de render, no como "terminó". La cura es garantizar una duración
 * mínima de visibilidad. Al centralizar el número aquí (y no repetir `250` por
 * los call sites) cualquier zona puede ajustar el ritmo en un solo lugar.
 */

/**
 * Tiempo mínimo que un loader debe permanecer visible.
 *
 * 250 ms es el umbral por debajo del cual el ojo no llega a registrar el
 * estado de carga; por encima, una operación instantánea se siente al menos
 * "consciente" en vez de rota.
 */
export const MIN_LOADING_MS = 250

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Espera a que `work` termine, pero NO devuelve antes de `minMs` desde la
 * llamada. El caller que muestre un loader antes de invocarla se asegura así
 * de que ese loader sea visible el mínimo.
 *
 * El aviso (log/notificación) que se dispare DESPUÉS de este await queda
 * naturalmente atrasado: nunca sale antes que el loader que lo anuncia.
 */
export async function withMinLoading<T>(
  work: Promise<T>,
  minMs: number = MIN_LOADING_MS
): Promise<T> {
  const started = Date.now()
  const result = await work
  const elapsed = Date.now() - started
  if (elapsed < minMs) await delay(minMs - elapsed)
  return result
}

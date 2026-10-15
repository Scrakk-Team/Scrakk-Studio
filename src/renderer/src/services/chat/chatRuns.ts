// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Estado de GENERACIÓN del chat, por sesión y FUERA del componente del panel.
 *
 * El panel del chat se REMONTA al mover/cambiar de panel. Con un `useState`
 * local, al volver el botón mostraba "Enviar" aunque la IA siguiera generando →
 * te dejaba mandar OTRO mensaje sobre la misma sesión y el stream viejo quedaba
 * huérfano (fuera de control, sin poder detenerlo). Acá vive por sesión: sobrevive
 * al remonte, es la ÚNICA fuente de verdad del botón, y guarda el `AbortController`
 * para que "Detener" siga funcionando después de mover el panel.
 *
 * Mismo criterio que el store de subagentes (estado fuera del componente).
 */

interface ChatRun {
  controller: AbortController
  /** El stream en curso, para poder ESPERARLO (editar mientras responde). */
  promise: Promise<void> | null
}

const runs = new Map<string, ChatRun>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no tumba a los demás.
    }
  }
}

/** Arranca (o reemplaza) el run de una sesión. */
export function beginRun(sessionId: string, controller: AbortController): void {
  runs.set(sessionId, { controller, promise: null })
  emit()
}

/** El llamador publica la promesa del stream para poder esperarlo. */
export function setRunPromise(sessionId: string, promise: Promise<void> | null): void {
  const run = runs.get(sessionId)
  if (run) run.promise = promise
}

export function getRunPromise(sessionId: string): Promise<void> | null {
  return runs.get(sessionId)?.promise ?? null
}

/**
 * Termina el run. Sólo si el controller sigue siendo el mismo: así el `finally`
 * de un stream viejo no apaga el run de uno nuevo (editar mientras responde).
 */
export function endRun(sessionId: string, controller: AbortController): void {
  const run = runs.get(sessionId)
  if (run?.controller === controller && runs.delete(sessionId)) emit()
}

export function isGenerating(sessionId: string | null | undefined): boolean {
  return !!sessionId && runs.has(sessionId)
}

/** Aborta el stream en curso de una sesión (botón "Detener"). */
export function stopRun(sessionId: string | null | undefined): void {
  if (!sessionId) return
  runs.get(sessionId)?.controller.abort()
}

export function subscribeRuns(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

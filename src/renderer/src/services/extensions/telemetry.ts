// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Telemetría del IDE → hosts de extensiones.
 *
 * El ajuste vive en el renderer (es del usuario y se guarda con el resto de
 * los ajustes), pero quien lo LEE es la extensión, en otro proceso
 * (`env.isTelemetryEnabled`). Esta es la única pieza que cruza ese dato.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ SE PUBLICA AL ARRANCAR Y EN CADA CAMBIO
 *
 *  - Al arrancar: una extensión lee `env.isTelemetryEnabled` en su `activate`,
 *    que es lo PRIMERO que corre. Publicarlo después deja el primer arranque
 *    con un valor viejo (medido en Cline: avisa "Telemetry is enabled in your
 *    settings but disabled in the extension" justo por esto).
 *  - En cada cambio: el usuario puede apagarla con la app abierta y el host ya
 *    está vivo. Ahí entra `env.onDidChangeTelemetryEnabled`.
 *
 * LO QUE NO HACE (a propósito): no reenvía, no filtra ni bloquea lo que una
 * extensión mande a su servidor. El IDE informa el estado de SU ajuste;
 * lo que la extensión haga con él es su consentimiento y su aviso legal.
 */

import { getPersistedTelemetryEnabled, persistTelemetryEnabled } from '@services/storage'

/**
 * Publica el valor actual (o uno explícito) a los hosts de extensiones.
 * Sin puente nativo (tests, build web) no hace nada.
 */
export function publishTelemetryEnabled(enabled: boolean = getPersistedTelemetryEnabled()): void {
  try {
    window.api?.extensions?.host?.setTelemetryEnabled?.(enabled)
  } catch {
    // Sin puente: el ajuste sigue guardado en el renderer y se publica en el
    // próximo arranque. Fallar aquí no puede romper el arranque de la app.
  }
}

/**
 * Cambia el ajuste: lo persiste Y lo publica.
 *
 * Es el camino que deben usar la configuración inicial y Ajustes, para que no
 * exista una forma de guardar el valor sin avisar a los hosts (que es cómo
 * una extensión termina leyendo un dato que ya no es cierto).
 */
export function applyTelemetryEnabled(enabled: boolean): void {
  persistTelemetryEnabled(enabled)
  publishTelemetryEnabled(enabled)
}

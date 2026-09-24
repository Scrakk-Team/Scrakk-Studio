// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Boot del sistema de extensiones — se llama UNA vez desde main.tsx.
 *
 * Orden (importa):
 *  1. Se conecta el PUENTE de la UI antes que nada. El main puede mandar una
 *     petición (`showInformationMessage`, un comando) en el primer segundo de
 *     vida de una extensión; si el listener todavía no existe, esa petición se
 *     pierde en el vacío y la extensión se queda esperando (medido: Cline
 *     colgaba `activate` los 30 s completos por esto).
 *  2. Comandos BUILT-IN de VS Code (mapa de compatibilidad): una extensión
 *     puede pedir `workbench.action.reloadWindow` en su primer segundo de
 *     vida, así que tienen que estar ANTES que las extensiones.
 *  3. Extensiones builtin (síncronas, dentro del bundle).
 *  4. Sincronización de documentos del editor (fuente de `workspace.textDocuments`).
 *  5. Extensiones del usuario instaladas en userData (asíncronas, vía IPC).
 *
 * Un error al cargar una extensión no corta el boot.
 */

import { hydrateEnabled } from './enabled'
import { initExtensionHostBridge } from './hostBridge'
import { initExtensionDocuments } from './documents'
import { loadBuiltinExtensions } from './loader/builtin'
import { loadInstalledExtensions } from './loader/installed'
import { installVSCodeBuiltinCommands } from './vscodeCommands'
import { publishTelemetryEnabled } from './telemetry'

export async function bootExtensions(): Promise<void> {
  // Estado on/off ANTES de registrar nada (las desactivadas se saltan).
  hydrateEnabled()
  initExtensionHostBridge()
  installVSCodeBuiltinCommands()
  // El ajuste de telemetría ANTES de cargar extensiones: `env.isTelemetryEnabled`
  // se lee en `activate`, y el host nuevo recibe el valor en su `init`.
  publishTelemetryEnabled()
  await loadBuiltinExtensions()
  initExtensionDocuments()
  await loadInstalledExtensions()
}

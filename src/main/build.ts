// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Marca de build (watermark).
 *
 * `__BUILD_ID__` lo inyecta electron-vite en prod (env `SCRAKK_BUILD_ID`).
 * Sirve para ATRIBUIR una filtración: cada build entregado (p. ej. a un tester)
 * lleva un id único. Se embebe en el bundle y se manda en las llamadas a la API
 * (`X-Scrakk-Build`), así queda también en los logs del servidor.
 */
declare const __BUILD_ID__: string

export const BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' && __BUILD_ID__.length > 0 ? __BUILD_ID__ : 'dev'

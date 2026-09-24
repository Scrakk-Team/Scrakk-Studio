// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Breadcrumbs — API pública.
 *
 * `BreadcrumbsBar` se spawnea donde sea (default: sobre el archivo activo
 * del editor) con su config: root, path, interactive, onNavigate. Cada
 * segmento abre el dropdown anclado de su nivel, servido con la API del
 * explorer (fs + FileTypeIcon).
 */

export { BreadcrumbsBar } from './BreadcrumbsBar'
export type { BreadcrumbsBarProps } from './BreadcrumbsBar'
export { buildSegments, type CrumbSegment } from './segments'

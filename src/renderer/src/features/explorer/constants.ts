// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Métricas fijas de fila del árbol (zoom eliminado — fila siempre 22px,
 * como el Explorer GTK). Altura fija = virtualización simple.
 */

export const ROW_HEIGHT = 22
export const ROW_FONT_SIZE = 12
export const ROW_ICON_SIZE = 16
export const ROW_INDENT = 12

/** Filas extra renderizadas por arriba/abajo del viewport (buffer de scroll). */
export const VIRTUAL_BUFFER = 10

/** Lote de inserción progresiva para directorios grandes (técnica GTK). */
export const BATCH_SIZE = 400

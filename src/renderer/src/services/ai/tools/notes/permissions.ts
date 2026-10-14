// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { PermissionRule } from '../types'

/**
 * Las notas no son rutas del disco: no aplican `path_block`/`size_limit` ni las
 * reglas de path del usuario. La frontera real es por nota (`ai.read`/`edit`/
 * `delete`), y la aplica `@services/notes/ai.ts`.
 */
export const permissions: PermissionRule[] = []

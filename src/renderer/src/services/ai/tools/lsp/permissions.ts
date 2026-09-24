// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { PermissionRule } from '../types'

/**
 * El LSP es solo-lectura respecto al disco: las operaciones de escritura
 * (rename/format) devuelven EDICIONES para que el agente las aplique con
 * write_file/replace_in_file — que ya tienen sus propios permisos.
 */
export const permissions: PermissionRule[] = []

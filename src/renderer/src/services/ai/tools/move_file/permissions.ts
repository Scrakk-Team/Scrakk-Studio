// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { PermissionRule } from '../types'
export const permissions: PermissionRule[] = [
  { id: 'move_file:block_paths', type: 'path_block', label: 'Blocked paths', description: 'Paths the tool cannot move', defaultAllowed: true },
]

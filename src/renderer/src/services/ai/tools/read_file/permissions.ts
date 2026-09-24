// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Permission rules for read_file
 */

import type { PermissionRule } from '../types'

export const permissions: PermissionRule[] = [
  {
    id: 'read_file:block_paths',
    type: 'path_block',
    label: 'Blocked paths',
    description: 'Files or directories the tool cannot read',
    defaultAllowed: true,
  },
  {
    id: 'read_file:max_file_size',
    type: 'size_limit',
    label: 'Max file size (bytes)',
    description: 'Maximum file size the tool is allowed to read',
    defaultAllowed: true,
  },
]

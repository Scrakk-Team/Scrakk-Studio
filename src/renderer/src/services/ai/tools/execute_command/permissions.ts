// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { PermissionRule } from '../types'
export const permissions: PermissionRule[] = [
  { id: 'execute_command:block_prefix', type: 'command_prefix', label: 'Blocked commands', description: 'Command prefixes that are not allowed', defaultAllowed: true },
]

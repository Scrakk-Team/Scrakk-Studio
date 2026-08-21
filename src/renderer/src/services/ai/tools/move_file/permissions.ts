import type { PermissionRule } from '../types'
export const permissions: PermissionRule[] = [
  { id: 'move_file:block_paths', type: 'path_block', label: 'Blocked paths', description: 'Paths the tool cannot move', defaultAllowed: true },
]

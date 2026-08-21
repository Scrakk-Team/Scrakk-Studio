import type { PermissionRule } from '../types'
export const permissions: PermissionRule[] = [
  { id: 'write_file:block_paths', type: 'path_block', label: 'Blocked paths', description: 'Files or directories the tool cannot write to', defaultAllowed: true },
]

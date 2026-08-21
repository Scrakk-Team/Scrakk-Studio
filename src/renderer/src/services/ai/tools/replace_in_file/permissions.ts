import type { PermissionRule } from '../types'
export const permissions: PermissionRule[] = [
  { id: 'replace_in_file:block_paths', type: 'path_block', label: 'Blocked paths', description: 'Files or directories the tool cannot edit', defaultAllowed: true },
]

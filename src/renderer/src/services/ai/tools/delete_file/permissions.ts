import type { PermissionRule } from '../types'
export const permissions: PermissionRule[] = [
  { id: 'delete_file:block_paths', type: 'path_block', label: 'Blocked paths', description: 'Files the tool cannot delete', defaultAllowed: true },
]

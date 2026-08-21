import type { PermissionRule } from '../types'
export const permissions: PermissionRule[] = [
  { id: 'append_file:block_paths', type: 'path_block', label: 'Blocked paths', description: 'Files the tool cannot append to', defaultAllowed: true },
]

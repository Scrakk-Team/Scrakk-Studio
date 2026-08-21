import type { PermissionRule } from '../types'

/**
 * El LSP es solo-lectura respecto al disco: las operaciones de escritura
 * (rename/format) devuelven EDICIONES para que el agente las aplique con
 * write_file/replace_in_file — que ya tienen sus propios permisos.
 */
export const permissions: PermissionRule[] = []

/**
 * Tabla única de la capa de compatibilidad — API pública.
 *
 * De aquí salen: el reporte de compatibilidad que ve el usuario al instalar una
 * extensión (`kinds.ts` se deriva de aquí), la razón de cada `unsupported()` del
 * host, y el audit que mantiene la tabla contra el runtime.
 *
 * Uso:
 *   import { SURFACE, findSurfaceEntry, coverageReport, auditApi } from '@shared/compatibility/surface'
 */

export { SUPPORT_BY_STATUS } from './types'
export type {
  KindSupport,
  SurfaceEntry,
  SurfaceNamespace,
  SurfaceRoute,
  SurfaceStatus
} from './types'

export {
  SURFACE,
  listSurfaceNamespaces,
  getSurfaceNamespace,
  allSurfaceEntries,
  findSurfaceEntry,
  validateSurface,
  coverageOf,
  coverageReport,
  describeCoverage,
  kindSupportOf
} from './registry'
export type { NamespaceCoverage, SurfaceRef } from './registry'

export { API_OBJECT_NAMESPACES, auditApi, missingFromApi } from './audit'

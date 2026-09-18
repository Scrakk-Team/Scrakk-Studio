/**
 * SEF tooling — convenciones centralizadas.
 *
 * Única fuente de verdad para el layout v2 de un paquete. El core (loader)
 * y las herramientas de autor comparten estas constantes vía este archivo
 * y su espejo en docs/extensions/sef.md.
 */

export const SEF = {
  /** Nombre del manifest dentro del paquete. */
  MANIFEST: 'manifest.json',
  /** Carpeta de código compilado. */
  DIST: 'dist',
  /** Entry del bundle compilado. */
  ENTRY: 'dist/modules.js',
  /** Data por tipo (layout v2). */
  THEMES_DIR: 'themes',
  ICONS_DIR: 'icons',
  PRODUCT_ICONS_DIR: 'productIcons',
  LSP_DIR: 'lsp',
  /** Extensión de paquete instalable. */
  EXTENSION_EXT: '.sef'
} as const

/** Id válido de extensión/server (mismo criterio que main al instalar). */
export const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i

/** Rutas de código (componentes) referenciables desde contributes. */
export function collectCodePaths(manifest: Record<string, unknown>): string[] {
  const contributes = (manifest.contributes ?? {}) as Record<string, unknown>
  const paths: string[] = []

  const push = (value: unknown): void => {
    if (typeof value === 'string') paths.push(value)
  }

  for (const panel of (contributes.panels as Array<Record<string, unknown>> | undefined) ?? []) {
    push(panel?.component)
  }
  for (const button of (contributes.activityBar as Array<Record<string, unknown>> | undefined) ?? []) {
    push(button?.icon)
  }
  for (const tab of (contributes.centerTabs as Array<Record<string, unknown>> | undefined) ?? []) {
    push(tab?.component)
    push(tab?.icon)
  }
  return [...new Set(paths)]
}

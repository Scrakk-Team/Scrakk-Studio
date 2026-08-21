/**
 * Boot del sistema de extensiones — se llama UNA vez desde main.tsx.
 *
 * Carga las extensiones builtin (síncronas, dentro del bundle) y después
 * las del usuario instaladas en userData (asíncronas, vía el puente nativo).
 * Un error al cargar una extensión no corta el boot.
 */

import { loadBuiltinExtensions } from './loader/builtin'
import { loadInstalledExtensions } from './loader/installed'

export async function bootExtensions(): Promise<void> {
  await loadBuiltinExtensions()
  await loadInstalledExtensions()
}
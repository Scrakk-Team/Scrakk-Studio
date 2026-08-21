import type { ProviderConfig } from './types'

/**
 * Detección automática de proveedores.
 *
 * Cualquier carpeta `services/providers/<id>/` cuyo `index.ts` exporte por
 * defecto un `ProviderConfig` se registra sola — sin tocar nada más:
 * `import.meta.glob` lo resuelve Vite al build (eager: los módulos se cargan
 * con la app, así la lista está disponible apenas arranca).
 */
const modules = import.meta.glob<{ default: ProviderConfig }>('./*/index.ts', {
  eager: true
})

/** Todos los proveedores detectados, ordenados por nombre. */
export const providers: ProviderConfig[] = Object.values(modules)
  .map((module) => module.default)
  .sort((a, b) => a.name.localeCompare(b.name))

export function getProvider(id: string): ProviderConfig | null {
  return providers.find((provider) => provider.id === id) ?? null
}

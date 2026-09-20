/**
 * Carga de módulos de panel — import dinámico con cache, SIN Suspense.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO `React.lazy` (el bug de "Cargando panel…" para siempre)
 *
 * Con `lazy()` dentro de un `<Suspense>`, si el módulo termina de cargar
 * DESPUÉS del render que suspendió, React tiene que reintentar el boundary
 * para montar el panel. En esta app ese reintento se pierde: el chunk se
 * descarga bien y el fallback se queda pegado ("Cargando panel…") hasta que
 * el usuario cambia de panel y vuelve — y ahí sí monta, porque el módulo ya
 * está en el cache y el import resuelve al instante.
 *
 * No es teoría: los loaders de paneles de extensión
 * (`ExtensionViewPanelLoader`, y el `panelComponentLoader` del manifest SEF)
 * ya documentan lo mismo y por eso NO usan `lazy`. Aquí es igual para los
 * paneles built-in: `useState` + import dinámico. Cuando el módulo llega,
 * React re-renderiza como con cualquier setState, y el panel nunca queda
 * colgado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL CACHE ES LO QUE HACE QUE ABRIR SEA INSTANTÁNEO
 *
 * `loaded` guarda el componente ya resuelto por id. Al volver a una tab que ya
 * se abrió, `PanelHost` arranca con el componente en la mano (estado inicial
 * del `useState`) y pinta el panel en el PRIMER render: ni fallback ni un
 * frame en blanco. `inflight` deduplica: dos montajes simultáneos del mismo
 * panel comparten una sola descarga.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PRECARGA ES SERIAL A PROPÓSITO
 *
 * `preloadPanelEntry` (hover/click del botón) calienta YA: hay intención del
 * usuario y esa descarga manda.
 *
 * `preloadPanelsLazily` (arranque) es la que se hace de a UNO. Antes se
 * lanzaban los 14 imports a la vez y en dev cada uno es un árbol de cientos
 * de módulos sueltos: esa avalancha saturaba al mismo tiempo el server de
 * Vite y el hilo del renderer, así que el panel que el usuario abría quedaba
 * en cola detrás de todo — "Cargando panel…" durante segundos, con suerte. De
 * a uno, cada import termina antes de que arranque el siguiente y abrir un
 * panel en el medio es inmediato (y salta la cola).
 */

import type { ComponentType } from 'react'
import type { PanelEntry } from '../../types'

/** Componentes ya resueltos por id de panel. */
const loaded = new Map<string, ComponentType>()

/** Descargas en curso por id (dedupe de montajes simultáneos). */
const inflight = new Map<string, Promise<ComponentType>>()

/** Cola de precarga en segundo plano (una entrada, sin duplicados). */
const queue: PanelEntry[] = []

let draining = false

/** Componente ya cargado de un panel, o null si todavía no está. */
export function loadedPanel(panelId: string): ComponentType | null {
  return loaded.get(panelId) ?? null
}

/**
 * Cachea el componente resuelto. Un módulo que no exporta un componente es un
 * error EXPLÍCITO: sin esto el panel quedaba en el loader para siempre (el
 * estado quedaba en `undefined` y el `if (!Component)` nunca avanzaba).
 */
function remember(id: string, component: ComponentType | undefined): ComponentType {
  if (typeof component !== 'function') {
    throw new Error(`el panel "${id}" no exporta un componente`)
  }
  loaded.set(id, component)
  return component
}

/**
 * Carga (o reusa) el módulo de un panel de la entrada dada.
 *
 * Entradas SIN `load` (paneles de extensión tipo vista: su `component` es un
 * loader que se auto-gestiona contra el Extension Host) resuelven al
 * `component` tal cual.
 */
export function loadPanelComponent(entry: PanelEntry): Promise<ComponentType> {
  const cached = loaded.get(entry.id)
  if (cached) return Promise.resolve(cached)
  if (!entry.load) {
    const component = entry.component
    if (!component) return Promise.reject(new Error(`panel "${entry.id}" sin componente`))
    try {
      return Promise.resolve(remember(entry.id, component))
    } catch (cause) {
      return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }
  const pending = inflight.get(entry.id)
  if (pending) return pending
  const promise = entry
    .load()
    .then((component) => {
      const resolved = remember(entry.id, component)
      inflight.delete(entry.id)
      return resolved
    })
    .catch((cause: unknown) => {
      // Un fallo NO se cachea: el próximo intento vuelve a probar (y el panel
      // muestra el error con su botón de reintentar, en vez de girar eterno).
      inflight.delete(entry.id)
      throw cause instanceof Error ? cause : new Error(String(cause))
    })
  inflight.set(entry.id, promise)
  return promise
}

/** Calienta el módulo de un panel sin bloquear ni romper si falla. */
export function preloadPanelEntry(entry: PanelEntry | null | undefined): void {
  if (!entry?.load || loaded.has(entry.id) || inflight.has(entry.id)) return
  void loadPanelComponent(entry).catch(() => {
    // Preload best-effort: si falla, el panel lo reporta al montarse.
  })
}

/**
 * Encola paneles para calentar DE A UNO, en segundo plano. Lo usa el arranque
 * (`preloadAllPanels`): el orden de la lista es el orden en que se calientan.
 */
export function preloadPanelsLazily(entries: PanelEntry[]): void {
  for (const entry of entries) {
    if (!entry.load || loaded.has(entry.id) || inflight.has(entry.id)) continue
    if (queue.some((queued) => queued.id === entry.id)) continue
    queue.push(entry)
  }
  void drainQueue()
}

/** Deja pasar el turno: idle si hay, si no un tick (nunca bloquea el import). */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const idle = (
      globalThis as {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      }
    ).requestIdleCallback
    if (typeof idle === 'function') idle(() => resolve(), { timeout: 250 })
    else setTimeout(resolve, 0)
  })
}

async function drainQueue(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const entry = queue.shift()
      if (!entry || loaded.has(entry.id) || inflight.has(entry.id)) continue
      await yieldToBrowser()
      try {
        await loadPanelComponent(entry)
      } catch {
        // Preload best-effort: un panel que falla no corta la cola.
      }
    }
  } finally {
    draining = false
  }
}

/** Solo tests: limpia cache y cola (los módulos quedan en el cache de ESM). */
export function _resetPanelModulesForTests(): void {
  loaded.clear()
  inflight.clear()
  queue.length = 0
  draining = false
}

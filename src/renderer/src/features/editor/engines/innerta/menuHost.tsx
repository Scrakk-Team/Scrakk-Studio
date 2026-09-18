/**
 * Host genérico del menú contextual de Innerta (editor + terminal).
 *
 * Un solo root React montado en un contenedor del body; cada menú (editor o
 * terminal) renderiza sus items con ContextMenu global de Scrakk (@ui). El
 * menú vive hasta que se cierra (click afuera / Escape / blur).
 */

import type { ContextMenuItem } from '@ui'
import { buildDefaultMenuItems, ContextMenu } from '@ui'
import { createRoot, type Root } from 'react-dom/client'

let container: HTMLDivElement | null = null
let root: Root | null = null

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  if (!container) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  root?.render(<ContextMenu items={items} x={x} y={y} onClose={() => root?.render(null)} />)
}

/**
 * Fallback global de click derecho: en TODO componente sin menú propio
 * registrado (los propios hacen `preventDefault` y este listener no los
 * toca), muestra Copiar / Pegar / Seleccionar todo funcionales. Se instala
 * 1× en AppShell; devuelve cleanup (doble-montaje de StrictMode safe).
 */
export function installDefaultContextMenu(): () => void {
  if (typeof window === 'undefined') return () => {}
  const onContextMenu = (event: MouseEvent): void => {
    // Menú propio del componente (explorer, editor, terminal…) o evento
    // ya consumido: no tocar.
    if (event.defaultPrevented) return
    const target = event.target
    if (!(target instanceof Element)) return
    // Sobre un menú abierto: no reabrir.
    if (target.closest('[role="menu"]')) return
    const items = buildDefaultMenuItems(target)
    if (!items) return
    // Suprime el nativo y muestra el nuestro.
    event.preventDefault()
    showContextMenu(event.clientX, event.clientY, items)
  }
  window.addEventListener('contextmenu', onContextMenu)
  return () => window.removeEventListener('contextmenu', onContextMenu)
}

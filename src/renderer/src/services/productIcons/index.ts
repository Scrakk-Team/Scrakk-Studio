/**
 * ProductIcons — API pública + hooks reactivos.
 *
 * Consumo:
 * - Declarativo: `<ProductIcon id="folder" size={16} />` (re-render live).
 * - Referencia: `productIcon('folder')` → ComponentType para activityBar,
 *   TabStrip `iconFor`, etc.
 * - Imperativo: `resolveProductIcon(id)` (devuelve glyph o componente).
 */

import { useEffect, useState } from 'react'
import {
  resolveProductIcon,
  subscribeToProductIcons,
  getActiveProductIconThemeId,
  listProductIconThemes
} from './registry'

export {
  resolveProductIcon,
  subscribeToProductIcons,
  registerProductIconTheme,
  unregisterProductIconTheme,
  getProductIconTheme,
  listProductIconThemes,
  getActiveProductIconTheme,
  getActiveProductIconThemeId,
  setActiveProductIconTheme,
  reactivateStoredProductIconTheme,
  themeHasProductIconId
} from './registry'
export type {
  ProductIconTheme,
  RegisteredProductIconTheme,
  ResolvedProductIcon,
  ProductIconFont,
  ProductIconDefinition,
  ProductIconFontFormat
} from './types'
export { SCRAKK_PRODUCT_ICON_THEME_ID } from './builtin'

/** Hook reactivo: resolución de un id (para render custom). */
export function useProductIcon(id: string) {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeToProductIcons(() => setVersion((v) => v + 1)), [])
  void version
  return resolveProductIcon(id)
}

/** Hook reactivo: id del tema activo (para pickers). */
export function useActiveProductIconThemeId(): string {
  const [current, setCurrent] = useState<string>(() => getActiveProductIconThemeId())
  useEffect(() => subscribeToProductIcons(() => setCurrent(getActiveProductIconThemeId())), [])
  return current
}

/** Hook reactivo: lista de temas (para settings). */
export function useProductIconThemes(): Array<{ id: string; name: string }> {
  const [themes, setThemes] = useState(() => listProductIconThemes())
  useEffect(() => subscribeToProductIcons(() => setThemes(listProductIconThemes())), [])
  return themes.map((t) => ({ id: t.id, name: t.name }))
}

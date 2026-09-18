/**
 * FileIcons — API pública + hooks reactivos.
 *
 * Consumo:
 * - Imperativo (tabs, layout/actions): `getFileIconUrl(name, opts)`.
 * - Declarativo (explorer): `useFileIconUrl(name, isDir, isExpanded)`.
 * - Render: `FileIconImage` vive en `./components` (tsx).
 */

import { useEffect, useState } from 'react'
import {
  getFileIconUrl,
  resolveFileIconUrl,
  subscribeToFileIcons,
  getActiveFileIconThemeId,
  listFileIconThemes
} from './registry'

export { getFileIconUrl, resolveFileIconUrl, subscribeToFileIcons }
export {
  registerFileIconTheme,
  unregisterFileIconTheme,
  getFileIconTheme,
  listFileIconThemes,
  getActiveFileIconTheme,
  getActiveFileIconThemeId,
  setActiveFileIconTheme,
  reactivateStoredFileIconTheme
} from './registry'
export type { FileIconTheme, RegisteredFileIconTheme, ResolveFileIconArgs } from './types'

/** Hook reactivo: devuelve el data URI del tema activo (null = fallback). */
export function useFileIconUrl(
  name: string,
  isDirectory: boolean,
  isExpanded?: boolean,
  opts?: { path?: string; languageId?: string; isRoot?: boolean }
): string | null {
  const [version, setVersion] = useState(0)

  useEffect(() => subscribeToFileIcons(() => setVersion((v) => v + 1)), [])
  void version

  return getFileIconUrl(name, {
    path: opts?.path,
    isDirectory,
    isExpanded,
    languageId: opts?.languageId,
    isRoot: opts?.isRoot
  })
}

/** Hook reactivo: id del tema activo (para pickers). */
export function useActiveFileIconThemeId(): string | null {
  const [id, setId] = useState<string | null>(() => getActiveFileIconThemeId())
  useEffect(
    () =>
      subscribeToFileIcons(() => {
        setId(getActiveFileIconThemeId())
      }),
    []
  )
  return id
}

/** Hook reactivo: lista de temas (para settings). */
export function useFileIconThemes(): Array<{ id: string; name: string }> {
  const [themes, setThemes] = useState(() => listFileIconThemes())
  useEffect(() => subscribeToFileIcons(() => setThemes(listFileIconThemes())), [])
  return themes.map((t) => ({ id: t.id, name: t.name }))
}

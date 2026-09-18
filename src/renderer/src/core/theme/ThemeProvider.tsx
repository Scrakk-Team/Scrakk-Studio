import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { commandRegistry } from '@services/commands'
import {
  activateTheme,
  getActiveThemeId,
  listThemes,
  subscribeToThemes
} from '@services/extensions/types/themes/logic'

export type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Temas builtin entre los que alterna el toggle claro/oscuro. */
const DARK_THEME_ID = 'scrakk-night'
const LIGHT_THEME_ID = 'scrakk-day'

/** Tipo ('dark'|'light') del tema activo según el registro de extensiones. */
function getActiveType(): Theme {
  const activeId = getActiveThemeId()
  const entry = activeId
    ? listThemes().find((candidate) => candidate.id === activeId)
    : null
  return entry?.type === 'light' ? 'light' : 'dark'
}

/**
 * Módulo core de tema: puente del contexto React hacia el sistema de
 * extensiones de themes (JSON). Los colores los aplica logic.ts; acá solo
 * se expone el estado reactivo y las acciones (toggle/comandos).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getActiveType)

  // Reactivo a activaciones desde cualquier origen (picker, bootstrap…).
  useEffect(() => subscribeToThemes(() => setThemeState(getActiveType())), [])

  const setTheme = useCallback((next: Theme): void => {
    activateTheme(next === 'light' ? LIGHT_THEME_ID : DARK_THEME_ID)
  }, [])

  const toggleTheme = useCallback((): void => {
    activateTheme(getActiveType() === 'light' ? DARK_THEME_ID : LIGHT_THEME_ID)
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  )

  // Comandos de tema en el registry central.
  useEffect(() => {
    const unsubs = [
      commandRegistry.register({
        id: 'theme.cycle',
        title: 'Cambiar tema claro/oscuro',
        category: 'Apariencia',
        keybinding: 'mod+alt+t',
        run: toggleTheme
      }),
      commandRegistry.register({
        id: 'theme.set.dark',
        title: 'Tema oscuro',
        category: 'Apariencia',
        run: () => {
          activateTheme(DARK_THEME_ID)
        }
      }),
      commandRegistry.register({
        id: 'theme.set.light',
        title: 'Tema claro',
        category: 'Apariencia',
        run: () => {
          activateTheme(LIGHT_THEME_ID)
        }
      })
    ]
    return () => unsubs.forEach((unsub) => unsub())
  }, [toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  }
  return context
}

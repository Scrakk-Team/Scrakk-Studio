import { LightbulbIcon, MoonIcon, SettingsIcon } from '@proicons/react'
import type { JSX } from 'react'
import { useProviders } from '@features/providers'
import { useTheme } from '@core/theme/ThemeProvider'
import { IconButton } from '@ui/IconButton'
import { SearchBar } from './components/SearchBar'
import styles from './StatusBar.module.css'

interface StatusBarProps {
  onOpenSettings: () => void
}

/**
 * Barra de estado inferior (la típica de un IDE). Vive debajo del workspace,
 * pegada al borde de la ventana. Izquierda: proveedor/modelo activo (clic
 * abre el modal de proveedores) + contadores de la sesión activa. Derecha:
 * toggle de tema y ajustes. Toda la info viene de los contextos globales, así
 * que se actualiza sola sin que el layout se entere.
 */
export function StatusBar({ onOpenSettings }: StatusBarProps): JSX.Element {
  const { activeProvider, getModel, openProvidersModal } = useProviders()

  const { theme, toggleTheme } = useTheme()

  const model = activeProvider ? getModel(activeProvider.id).trim() : ''

  return (
    <footer className={styles.bar} aria-label="Barra de estado">
      <div className={styles.group}>
        <SearchBar />
        {activeProvider ? (
          <button
            type="button"
            className={styles.item}
            onClick={openProvidersModal}
            title={`Proveedor: ${activeProvider.name}${model ? ` · ${model}` : ''}`}
          >
            <span className={styles.provider}>
              <span>{activeProvider.name}</span>
              {model ? (
                <>
                  <span className={styles.sep} aria-hidden="true">
                    ·
                  </span>
                  <span className={styles.model}>{model}</span>
                </>
              ) : null}
            </span>
          </button>
        ) : null}
      </div>

      <div className={styles.group}>
        <IconButton
          size="sm"
          label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <LightbulbIcon size={14} /> : <MoonIcon size={14} />}
        </IconButton>
        <IconButton size="sm" label="Ajustes" onClick={onOpenSettings}>
          <SettingsIcon size={14} />
        </IconButton>
      </div>
    </footer>
  )
}
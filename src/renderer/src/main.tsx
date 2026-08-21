import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { applyInitialTheme, ThemeProvider } from '@core/theme/ThemeProvider'
import { bootExtensions } from '@services/extensions/boot'
import { initLspWorkspaceSync } from '@services/lsp'

// Módulos de estilo global (tokens + temas) — se importan acá, una sola vez.
import '@core/theme/tokens.css'
import '@core/theme/themes.css'
import './styles/global.css'

// Aplicar el tema guardado antes del primer paint (sin flash).
applyInitialTheme()

// Sistema de extensiones SEF: carga builtin + extensiones del usuario.
void bootExtensions()
initLspWorkspaceSync()

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  )
}

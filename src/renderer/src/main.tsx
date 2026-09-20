import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AppErrorBoundary } from './components/layout/AppErrorBoundary/AppErrorBoundary'
import { ThemeProvider } from '@core/theme/ThemeProvider'
import { applyStartupTheme } from '@services/extensions/types/themes/bootstrap'
import { bootExtensions } from '@services/extensions/boot'
import { initDiagnosticsDecorations, initLspFileSync, initLspWorkspaceSync } from '@services/lsp'

// Módulos de estilo global (tokens) — se importan aquí, una sola vez.
// Los colores NO viven en CSS: vienen de los theme.json del sistema
// de extensiones (applyStartupTheme los aplica antes del primer paint).
import '@core/theme/tokens.css'
import './styles/global.css'

// Aplicar el tema JSON (persistido o default) antes del primer paint (sin flash).
applyStartupTheme()

// Sistema de extensiones SEF: carga builtin + extensiones del usuario.
void bootExtensions()
initLspWorkspaceSync()
// El buffer del editor se sincroniza EN VIVO con los language servers: sin
// esto el server sólo conocía el archivo tal como estaba al abrirlo (los
// errores que escribes no aparecían hasta reabrirlo).
initLspFileSync()
// Los diagnósticos se pintan como subrayado en el editor (LSP + extensiones).
// Se arranca temprano: el canal escucha al store, que es el que ya recibe los
// dos streams, así que no depende de que haya un editor montado.
initDiagnosticsDecorations()

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AppErrorBoundary>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AppErrorBoundary>
    </StrictMode>
  )
}

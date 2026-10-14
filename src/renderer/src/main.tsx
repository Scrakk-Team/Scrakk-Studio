// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AppErrorBoundary } from './components/layout/AppErrorBoundary/AppErrorBoundary'
import { ThemeProvider } from '@core/theme/ThemeProvider'
import { initI18n } from '@core/i18n'
import { registerBuiltinFileHandlers } from '@features/fileHandlers'
import { applyStartupTheme } from '@services/extensions/types/themes/bootstrap'
import { setRadiusOverride, clearRadiusOverride } from '@services/extensions/types/themes/logic'
import {
  registerPaletteCommand,
  registerToolHandler,
  type ScrakkRuntimeApi
} from '@services/extensions/runtime/bridge'
import { bootExtensions } from '@services/extensions/boot'
import { initDiagnosticsDecorations, initLspFileSync, initLspWorkspaceSync } from '@services/lsp'
import { initDiffViews } from '@services/diff'
import { initZoomGuard } from './core/zoomGuard'

// Módulos de estilo global (tokens) — se importan aquí, una sola vez.
// Los colores NO viven en CSS: vienen de los theme.json del sistema
// de extensiones (applyStartupTheme los aplica antes del primer paint).
import '@core/theme/tokens.css'
import './styles/global.css'

// Aplicar el tema JSON (persistido o default) antes del primer paint (sin flash).
applyStartupTheme()

// Idioma de la interfaz (persistido o 'system') antes del primer render.
initI18n()

// Visores por formato: los handlers built-in quedan listos antes del primer
// render, así un `.md` abre directo en modo visor.
registerBuiltinFileHandlers()

// Puente para bundles .sef: no pueden importar módulos del IDE, así que lo que
// el IDE les presta queda en `window.scrakk` (p. ej. `window.scrakk.radius`).
// El tema la define por JSON; los comandos/tools los registra el BUNDLE (ver
// `services/extensions/runtime/bridge.ts`).
declare global {
  interface Window {
    scrakk?: ScrakkRuntimeApi & {
      radius: { set: typeof setRadiusOverride; reset: typeof clearRadiusOverride }
    }
  }
}
window.scrakk ??= {
  radius: { set: setRadiusOverride, reset: clearRadiusOverride },
  commands: { register: registerPaletteCommand },
  tools: { register: registerToolHandler }
}

// Sistema de extensiones SEF: carga builtin + extensiones del usuario.
void bootExtensions()
// Los diagnósticos se pintan como subrayado en el editor (LSP + extensiones).
// Se arranca temprano: el canal escucha al store, que es el que ya recibe los
// dos streams, así que no depende de que haya un editor montado.
initDiagnosticsDecorations()
// Las tabs de diff se limpian solas al cerrarlas: su fondo de línea vive en el
// store de decoraciones y nadie más lo iba a bajar (memoria que se acumulaba).
initDiffViews()
// El zoom de PÁGINA de Chromium se dispara en cualquier panel que no sea el
// editor/terminal/visor (ver `zoomGuard`) y queda guardado en el perfil.
initZoomGuard()

/**
 * Corre `fn` DESPUÉS del primer paint (primer idle), no antes.
 *
 * Todo lo de arriba tiene que estar sí o sí (el tema y el idioma ANTES del
 * primer render; los diagnósticos y el zoom son baratos y tienen que estar
 * desde el arranque). Lo de abajo —el barrido del workspace y el alta de
 * archivos en los language servers— es lo pesado y NO hace falta para que el
 * usuario vea la app: diferido, no compite con los primeros frames.
 */
const afterFirstPaint = (fn: () => void): void => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn(), { timeout: 400 })
  } else {
    setTimeout(fn, 0)
  }
}

afterFirstPaint(initLspWorkspaceSync)
// El buffer del editor se sincroniza EN VIVO con los language servers: sin
// esto el server sólo conocía el archivo tal como estaba al abrirlo (los
// errores que escribes no aparecían hasta reabrirlo).
afterFirstPaint(initLspFileSync)

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

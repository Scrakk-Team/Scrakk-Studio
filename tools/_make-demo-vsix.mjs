// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe temporal: fabrica un `.vsix` MÍNIMO pero real.
 *
 * Qué tiene:
 *  - una vista de ÁRBOL en la activity bar (contenedor + vista + icono SVG),
 *  - un provider que devuelve CERO nodos (para que se vea el `viewsWelcome`),
 *  - `viewsWelcome` con texto y un BOTÓN de comando CON argumentos,
 *  - un comando real (`demo.create`) que loguea sus args y el estado del IDE
 *    (`env.isTelemetryEnabled`, `env.shell`, `l10n.t`).
 *
 * Con esto se prueba la cadena completa en la app compilada: traducción →
 * instalación → host → árbol → estado vacío de la extensión → botón → comando.
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'

const OUT = process.argv[2] ?? '/tmp/scrakk-demo-tree-1.0.0.vsix'
const EXT_ID = 'scrakk-demo.demo-tree'

const packageJSON = {
  name: 'demo-tree',
  displayName: 'Demo Tree',
  publisher: 'scrakk-demo',
  version: '1.0.0',
  engines: { vscode: '^1.80.0' },
  main: './out/extension.js',
  activationEvents: ['onView:demo.tree'],
  contributes: {
    viewsContainers: {
      activitybar: [{ id: 'demo-side', title: 'Demo', icon: 'res/icon.svg' }]
    },
    views: {
      'demo-side': [{ id: 'demo.tree', name: 'Árbol Demo', type: 'tree' }]
    },
    viewsWelcome: [
      {
        view: 'demo.tree',
        contents:
          // El botón lleva args URL-encoded, tal como los emite VS Code.
          'Sin elementos todavía.\n[Crear elemento](command:demo.create?%5B%22saludo%22%5D)\nUsá el botón para empezar.'
      }
    ],
    commands: [{ command: 'demo.create', title: 'Demo: crear elemento' }]
  }
}

const extensionJS = `
const vscode = require('vscode')

// Provider VACÍO a propósito: es el caso que muestra el viewsWelcome.
const provider = {
  getChildren: () => [],
  getTreeItem: (element) => element
}

function activate(context) {
  console.log(
    '[demo] activate telemetria=' + vscode.env.isTelemetryEnabled +
      ' shell=' + String(vscode.env.shell) +
      ' l10n=' + vscode.l10n.t('Hola {0}', 'demo')
  )

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('demo.tree', provider)
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('demo.create', (arg) => {
      console.log('[demo] comando demo.create arg=' + JSON.stringify(arg))
      vscode.window.showInformationMessage('Demo: el comando corrió con ' + JSON.stringify(arg))
      return { ok: true }
    })
  )

  // Reporte a pedido: el probe puede preguntar el estado REAL del host en
  // cualquier momento (útil para ver la telemetría en vivo).
  context.subscriptions.push(
    vscode.commands.registerCommand('demo.report', () => {
      console.log('[demo] report telemetria=' + vscode.env.isTelemetryEnabled)
      return { telemetry: vscode.env.isTelemetryEnabled }
    })
  )

  // Cambio en caliente del ajuste del IDE.
  if (vscode.env.onDidChangeTelemetryEnabled) {
    context.subscriptions.push(
      vscode.env.onDidChangeTelemetryEnabled((enabled) => {
        console.log('[demo] telemetria CAMBIO a ' + enabled)
      })
    )
  }

  // Clave de contexto: la usa el "when" de las contribuciones (y del welcome).
  void vscode.commands.executeCommand('setContext', 'demo.ready', true)
  console.log('[demo] setContext listo')
}

function deactivate() {}
module.exports = { activate, deactivate }
`

const iconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c0c0c0" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>`

const files = {
  'extension/package.json': strToU8(JSON.stringify(packageJSON, null, 2)),
  'extension/out/extension.js': strToU8(extensionJS),
  'extension/res/icon.svg': strToU8(iconSVG),
  'extension.vsixmanifest': strToU8(
    '<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" />'
  )
}

writeFileSync(OUT, zipSync(files, { level: 6 }))
console.log(`vsix escrito: ${OUT} (${EXT_ID})`)

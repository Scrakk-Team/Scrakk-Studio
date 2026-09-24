// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Probe temporal: `.vsix` mínimo cuyo ÚNICO fin es abrir un archivo.
 *
 * Sirve para verificar la cadena de un lenguaje de extensión de punta a punta
 * sin depender del explorador (que en un probe headless es frágil): la
 * extensión corre `vscode.open` con un path real, el IDE abre la tab, el
 * registro de lenguajes resuelve `gleam` y el tokenizador pinta.
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'

const OUT = process.argv[2] ?? '/tmp/scrakk-openfile-1.0.0.vsix'
const EXT_ID = 'scrakk-demo.open-file'

const packageJSON = {
  name: 'open-file',
  displayName: 'Demo Open File',
  publisher: 'scrakk-demo',
  version: '1.0.0',
  engines: { vscode: '^1.80.0' },
  main: './out/extension.js',
  activationEvents: ['onCommand:demo.openFile', 'onCommand:demo.openFolder'],
  contributes: {
    // El instalador exige al menos UNA contribución traducible (si no, rechaza
    // el paquete por "sin traductor"). Una extensión que SÓLO aporta comandos
    // cae en ese caso, así que acá va un contenedor mínimo: es relleno para
    // pasar el gate, lo que se prueba es el comando.
    viewsContainers: {
      activitybar: [{ id: 'demo-open-side', title: 'Demo Open', icon: 'res/icon.svg' }]
    },
    views: {
      'demo-open-side': [{ id: 'demo.open.view', name: 'Demo Open', type: 'tree' }]
    },
    commands: [
      { command: 'demo.openFile', title: 'Demo: abrir un archivo' },
      { command: 'demo.openFolder', title: 'Demo: abrir una carpeta' }
    ]
  }
}

const extensionJS = `
const vscode = require('vscode')

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('demo.openFile', async (filePath) => {
      console.log('[demo-open] abriendo ' + filePath)
      await vscode.commands.executeCommand('vscode.open', filePath)
      return { opened: String(filePath) }
    })
  )
  // Sin workspace, el IDE abre la pantalla de bienvenida y vscode.open no
  // tiene dónde poner el documento: los probes necesitan fijarlo primero.
  context.subscriptions.push(
    vscode.commands.registerCommand('demo.openFolder', async (folderPath) => {
      console.log('[demo-open] workspace = ' + folderPath)
      await vscode.commands.executeCommand('vscode.openFolder', folderPath)
      return { opened: String(folderPath) }
    })
  )
  console.log('[demo-open] activate listo')
}

function deactivate() {}
module.exports = { activate, deactivate }
`

const iconSVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c0c0c0" stroke-width="1.6"><path d="M4 6h16v12H4z"/></svg>'

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

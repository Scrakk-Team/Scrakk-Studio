/**
 * Probe temporal: `.vsix` que SUBRAYA cosas (decoraciones + diagnósticos).
 *
 * Es el arnés del canal de decoraciones: una extensión real que hace lo que
 * hace una extensión real —
 *
 *  - `createTextEditorDecorationType` + `setDecorations` sobre el editor activo
 *    (dos rangos: uno con el color del tipo y otro con `hoverMessage` propio),
 *  - `createDiagnosticCollection().set()` con error, aviso y pista (cada
 *    severidad tiene su color y su estilo).
 *
 * El probe que lo usa (`tools/_probe-decorations.mjs`) mide PÍXELES sobre el
 * screenshot del canvas: es la única forma de saber que el motor dibuja el
 * subrayado y no sólo que el payload viajó.
 *
 * Se borra cuando termine el trabajo: no es parte del producto.
 */

import { writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'

const OUT = process.argv[2] ?? '/tmp/scrakk-decorations-1.0.0.vsix'
const EXT_ID = 'scrakk-demo.decorations'

const packageJSON = {
  name: 'decorations',
  displayName: 'Demo Decorations',
  publisher: 'scrakk-demo',
  version: '1.0.0',
  engines: { vscode: '^1.80.0' },
  main: './out/extension.js',
  activationEvents: ['onCommand:demo.decorate', 'onCommand:demo.clearDecorations'],
  contributes: {
    // El instalador exige al menos UNA contribución traducible: contenedor
    // mínimo de relleno. Lo que se prueba es el comando.
    viewsContainers: {
      activitybar: [{ id: 'demo-deco-side', title: 'Demo Deco', icon: 'res/icon.svg' }]
    },
    views: {
      'demo-deco-side': [{ id: 'demo.deco.view', name: 'Demo Deco', type: 'tree' }]
    },
    commands: [
      { command: 'demo.decorate', title: 'Demo: subrayar' },
      { command: 'demo.clearDecorations', title: 'Demo: limpiar subrayados' }
    ]
  }
}

const extensionJS = `
const vscode = require('vscode')

let diagnostics = null
let tipo = null
let tipoVacio = null

function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection('deco-probe')

  context.subscriptions.push(
    vscode.commands.registerCommand('demo.decorate', () => {
      const editor = vscode.window.activeTextEditor
      const report = {
        hasEditor: Boolean(editor),
        path: editor ? editor.document.fileName : null,
        hasSetDecorations: editor ? typeof editor.setDecorations === 'function' : false
      }
      if (!editor) return report

      // 1) Decoración de EXTENSIÓN (naranja, ondulada): color del tipo + un
      //    rango con hoverMessage propio.
      tipo = vscode.window.createTextEditorDecorationType({
        textEditorDecorationType: 'underline wavy orange'
      })
      editor.setDecorations(tipo, [
        new vscode.Range(1, 0, 1, 24),
        { range: new vscode.Range(3, 2, 3, 18), hoverMessage: 'rango con hover propio' }
      ])
      report.decorationKey = tipo && tipo.key ? tipo.key : null

      // 1b) Rango VACÍO (start == end) en una línea que EXISTE, con color
      //     propio: es el caso que el server de CSS manda de verdad
      //     (aviso 'llave esperada' en 3:0 → 3:0) y que el IDE descartaba.
      tipoVacio = vscode.window.createTextEditorDecorationType({
        textEditorDecorationType: 'underline wavy #00e5ff'
      })
      editor.setDecorations(tipoVacio, [
        { range: new vscode.Range(11, 4, 11, 4), hoverMessage: 'rango VACÍO (start == end)' }
      ])
      report.emptyKey = tipoVacio && tipoVacio.key ? tipoVacio.key : null

      // 2) DIAGNÓSTICOS: el IDE los subraya con su color de severidad.
      diagnostics.set(editor.document.uri, [
        new vscode.Diagnostic(new vscode.Range(5, 0, 5, 12), 'error del probe', vscode.DiagnosticSeverity.Error),
        new vscode.Diagnostic(new vscode.Range(7, 0, 7, 12), 'aviso del probe', vscode.DiagnosticSeverity.Warning),
        new vscode.Diagnostic(new vscode.Range(9, 0, 9, 12), 'pista del probe', vscode.DiagnosticSeverity.Hint)
      ])
      report.diagnostics = 3

      console.log('[deco-probe] ' + JSON.stringify(report))
      return report
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('demo.clearDecorations', () => {
      const editor = vscode.window.activeTextEditor
      if (editor && tipo) editor.setDecorations(tipo, [])
      if (editor && tipoVacio) editor.setDecorations(tipoVacio, [])
      if (diagnostics && editor) diagnostics.set(editor.document.uri, [])
      console.log('[deco-probe] limpiado')
      return { cleared: true }
    })
  )

  console.log('[deco-probe] activate listo')
}

function deactivate() {}

module.exports = { activate, deactivate }
`

const iconSVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c0c0c0" stroke-width="1.6"><path d="M4 18c4-8 12 8 16 0"/></svg>'

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

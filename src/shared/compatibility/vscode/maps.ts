// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Compatibility/vscode — mapa `vscode.*` / `contributes.*` → SEF/Scrakk.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE ESTA VERDAD (esto estaba MAL antes)
 *
 * Este archivo era una TERCERA lista de lo soportado, escrita a mano, y decía
 * cosas que ya no eran ciertas: `contributes.views` → "futuro" (hay traductor
 * y paneles andando), `vscode.window.registerTreeDataProvider` → `none` (el
 * IDE pinta árboles), `createWebviewPanel` → "webview no soportada" (hay
 * paneles de webview en el editor).
 *
 * El reporte de cobertura que ve el usuario al instalar sale de aquí, así que
 * mentir en este archivo es mentirle al usuario. Ahora:
 *
 *  - El lado DECLARATIVO es una PROYECCIÓN de la tabla única
 *    (`surface/namespaces/contributes`): una sola verdad, sin duplicar.
 *  - El lado de CÓDIGO (muestreo por `includes` del bundle) está escrito a
 *    mano —es una heurística, no una promesa— pero cada fila dice el estado
 *    REAL del host, y hay un test que verifica que aquí no diga `none` para
 *    algo que el host sí implementa.
 */

import { getSurfaceNamespace, kindSupportOf, type SurfaceStatus } from '../surface'

export interface MapEntry {
  target: string | null
  support: 'full' | 'partial' | 'none'
  note?: string
}

/** Estado de la tabla → estado del reporte. */
function supportOf(status: SurfaceStatus): MapEntry['support'] {
  const kind = kindSupportOf(status)
  if (kind === 'supported') return 'full'
  if (kind === 'pending') return 'partial'
  return 'none'
}

/** Declarativos: traducción directa a SEF sin ejecutar código. */
function buildDeclarativeMap(): Record<string, MapEntry> {
  const out: Record<string, MapEntry> = {}
  for (const entry of getSurfaceNamespace('contributes')?.apis ?? []) {
    out[`contributes.${entry.key}`] = {
      target: entry.route === 'sef' && entry.native ? `SEF contributes.${entry.native}` : null,
      support: supportOf(entry.status),
      // Lo que no es `real` explica su degradación (regla de la tabla).
      note: entry.status === 'real' ? entry.note : (entry.degradation ?? entry.note)
    }
  }
  return out
}

export const DECLARATIVE_MAP: Record<string, MapEntry> = buildDeclarativeMap()

/**
 * Imperativos (muestreo del entry JS): prefijos a buscar.
 *
 * `support` describe si el IDE puede SOSTENER ese uso, no si el API existe:
 * un `languages.registerX` existe y no lo consume nadie todavía → `partial`,
 * y se dice por qué.
 */
export const CODE_MAP: Record<string, MapEntry> = {
  'vscode.commands.registerCommand': {
    target: 'registry de comandos del IDE',
    support: 'full'
  },
  'vscode.commands.executeCommand': {
    target: 'registry + mapa de comandos built-in',
    support: 'full',
    note: 'los built-in del entorno se traducen a acciones nativas (ver commands/builtin.ts)'
  },

  // ── Notificaciones ─────────────────────────────────────────────────────
  'vscode.window.showInformationMessage': { target: 'notificaciones del IDE', support: 'full' },
  'vscode.window.showWarningMessage': { target: 'notificaciones del IDE', support: 'full' },
  'vscode.window.showErrorMessage': { target: 'notificaciones del IDE', support: 'full' },

  // ── Paneles ────────────────────────────────────────────────────────────
  'vscode.window.registerTreeDataProvider': {
    target: 'tipo SEF views (el IDE pinta el árbol)',
    support: 'full'
  },
  'vscode.window.createTreeView': { target: 'tipo SEF views', support: 'full' },
  'vscode.window.registerWebviewViewProvider': {
    target: 'tipo SEF views (iframe aislado)',
    support: 'full'
  },
  'vscode.window.createWebviewPanel': {
    target: 'panel de webview del editor (iframe aislado)',
    support: 'full'
  },
  'vscode.window.createStatusBarItem': { target: 'barra de estado del IDE', support: 'full' },
  'vscode.window.createOutputChannel': {
    target: 'canal de salida de la extensión',
    support: 'partial',
    note: 'el canal existe y recibe los logs; el panel de Salida del IDE todavía no lo muestra'
  },
  'vscode.window.withProgress': {
    target: 'notificación con progreso',
    support: 'partial',
    note: 'la tarea corre; la barra de progreso todavía no se pinta'
  },

  // ── Diálogos ───────────────────────────────────────────────────────────
  'vscode.window.showQuickPick': {
    target: null,
    support: 'none',
    note: 'el selector nativo del IDE todavía no está cableado a esta API'
  },
  'vscode.window.showInputBox': {
    target: null,
    support: 'none',
    note: 'el input nativo del IDE todavía no está cableado a esta API'
  },

  // ── Workspace ──────────────────────────────────────────────────────────
  'vscode.workspace.getConfiguration': {
    target: 'ajustes de la extensión (persistidos por el main)',
    support: 'full'
  },
  'vscode.workspace.fs': {
    target: 'fs con jail de permisos',
    support: 'full'
  },
  'vscode.workspace.findFiles': { target: 'búsqueda de archivos del main', support: 'full' },
  'vscode.workspace.createFileSystemWatcher': {
    target: null,
    support: 'none',
    note: 'los watchers existen como API inerte: el main tiene `watchDir` pero no está cableado'
  },
  'vscode.workspace.applyEdit': {
    target: null,
    support: 'none',
    note: 'necesita el canal host → editor (Innerta)'
  },

  // ── Lenguajes ──────────────────────────────────────────────────────────
  'vscode.languages.register': {
    target: 'registry de proveedores del host',
    support: 'partial',
    note: 'el registro existe y no se cae; el editor todavía no consulta los proveedores'
  },

  // ── Dominios grandes sin equivalente ───────────────────────────────────
  'vscode.debug': { target: null, support: 'none', note: 'no hay motor de debug en Scrakk' },
  'vscode.scm': { target: null, support: 'none', note: 'el SCM de Scrakk es propio (git nativo), no un API público' },
  'vscode.tasks': { target: null, support: 'none', note: 'no hay sistema de tareas' },
  'vscode.comments': { target: null, support: 'none', note: 'no hay API de comentarios' },
  'vscode.notebooks': { target: null, support: 'none', note: 'no hay notebooks' },
  'vscode.tests': { target: null, support: 'none', note: 'no hay testing API' }
}

export function lookupCodeApi(id: string): MapEntry {
  if (CODE_MAP[id]) return CODE_MAP[id]
  let best: MapEntry | null = null
  let bestLen = -1
  for (const [k, v] of Object.entries(CODE_MAP)) {
    if (id === k || id.startsWith(k)) {
      if (k.length > bestLen) {
        best = v
        bestLen = k.length
      }
    }
  }
  return best ?? { target: null, support: 'none', note: 'unmapped' }
}

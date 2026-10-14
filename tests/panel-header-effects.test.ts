// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Los paneles publican las acciones de su header con `setActions` y las
 * retiran en el cleanup.
 *
 * `setActions`/`setTitle` son estables (useCallback con deps vacías), pero el
 * OBJETO del contexto (`usePanelTitleOptional()`) cambia de identidad cada vez
 * que el título o las acciones cambian. Si el efecto depende del objeto entero
 * se auto-reactiva en bucle:
 *
 *   setActions(fn) → estado cambia → contexto nuevo → cleanup → setActions(null)
 *   → contexto nuevo → el efecto vuelve a correr → …
 *
 * React corta el bucle a los ~50 updates ("Maximum update depth exceeded"),
 * pero son ~50 renders del panel entero por montaje, con el hilo principal
 * saturado (se veía como "fetch failed" al enviar mensajes).
 *
 * Sin entorno DOM en los tests, la regresión se verifica sobre el código: lo
 * que se rompió fue exactamente la lista de dependencias.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// `URL.pathname` devuelve una ruta CON CODIFICACIÓN URL y con la barra inicial
// siempre: en Windows da `/C:/Users/...`, y `readdirSync` la resuelve contra la
// unidad del directorio actual -> `C:\C:\Users\...` -> ENOENT.
// `fileURLToPath` devuelve una ruta del sistema de archivos válida.
const PANELS_DIR = fileURLToPath(
  new URL('../src/renderer/src/features/layout/panels', import.meta.url)
)

/** Todos los .tsx de los paneles built-in. */
function panelSources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = []
  for (const entry of readdirSync(PANELS_DIR)) {
    const full = join(PANELS_DIR, entry)
    if (!statSync(full).isDirectory()) continue
    const file = join(full, `${entry}.tsx`)
    try {
      out.push({ file, src: readFileSync(file, 'utf8') })
    } catch {
      // el panel no tiene un <nombre>.tsx homónimo: se ignora
    }
  }
  return out
}

/** Los deps declarados en cada `useEffect` del archivo. */
function effectDeps(src: string): string[] {
  const deps: string[] = []
  // `}, [ ... ])` al cierre de un useEffect.
  for (const match of src.matchAll(/\},\s*\[([^\]]*)\]\)/g)) {
    deps.push(match[1])
  }
  return deps
}

describe('header del panel — sin dependencia del objeto de contexto', () => {
  const panels = panelSources()
  it('hay paneles para escanear', () => {
    expect(panels.length).toBeGreaterThan(0)
  })

  it('ningún efecto depende de `panelHeader` (el objeto del contexto)', () => {
    const offenders: string[] = []
    for (const { file, src } of panels) {
      if (!src.includes('usePanelTitleOptional')) continue
      for (const deps of effectDeps(src)) {
        if (/(^|[\s,])panelHeader([\s,]|$)/.test(deps)) {
          offenders.push(`${file}: [${deps}]`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('los que publican acciones usan la función estable', () => {
    // Si un panel llama a setActions, tiene que salir de `panelHeader?.setActions`
    // para que la dependencia sea estable.
    const offenders: string[] = []
    for (const { file, src } of panels) {
      if (!src.includes('usePanelTitleOptional')) continue
      if (!/\.setActions\(/.test(src)) continue
      if (!/const\s+setHeaderActions\s*=\s*panelHeader\?\.setActions/.test(src)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
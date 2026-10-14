// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del rewriter de externals de bundles `.sef`.
 *
 * El bundler deja specifiers BARE y el loader importa el bundle como `data:`
 * URL (que no puede resolverlos): antes de importar se reescriben a la URL del
 * shim. Acá se prueba que pegue SOLO en los imports y nunca en un string suelto.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  BUNDLE_EXTERNALS,
  createBundleModuleUrl,
  providedModuleSource,
  rewriteBundleExternals
} from '../src/renderer/src/services/extensions/loader/externals'

const URLS: Record<string, string> = {
  react: 'https://app/reactShim.js',
  'react-dom': 'https://app/reactDomShim.js',
  'react-dom/client': 'https://app/reactDomClientShim.js',
  'react/jsx-runtime': 'https://app/jsxRuntimeShim.js',
  'react/jsx-dev-runtime': 'https://app/jsxDevRuntimeShim.js',
  '@features/layout': 'https://app/layoutShim.js'
}

/** Salida real de `sef build` (esbuild, jsx automatic). */
const REAL_BUNDLE = `// probe/panels/Panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export const modules = { "panels/Panel.tsx": function Panel() { return jsx("div", {}) } };
`

describe('rewriteBundleExternals', () => {
  it('reescribe los imports del bundle real (jsx-runtime + react)', () => {
    const out = rewriteBundleExternals(REAL_BUNDLE, URLS)
    expect(out).toContain('from "https://app/jsxRuntimeShim.js"')
    expect(out).toContain("from 'https://app/reactShim.js'")
    expect(out).not.toContain('"react/jsx-runtime"')
    expect(out).not.toContain("'react'")
  })

  it('match exacto: "react" no pisa "react-dom" ni "react-dom/client"', () => {
    const src =
      'import { createRoot } from "react-dom/client";\nimport "react-dom";\nimport React from "react";\n'
    const out = rewriteBundleExternals(src, URLS)
    expect(out).toContain('"https://app/reactDomClientShim.js"')
    expect(out).toContain('"https://app/reactDomShim.js"')
    expect(out).toContain('"https://app/reactShim.js"')
  })

  it('reescribe `export * from` y el import() dinámico', () => {
    const src = 'export * from "@features/layout";\nconst r = await import("react");\n'
    const out = rewriteBundleExternals(src, URLS)
    expect(out).toContain('from "https://app/layoutShim.js"')
    expect(out).toContain('import("https://app/reactShim.js")')
  })

  it('NO toca un string literal suelto del código', () => {
    const src =
      'const label = "react";\nconst spec = \'react-dom\';\nimport { jsx } from "react/jsx-runtime";\n'
    const out = rewriteBundleExternals(src, URLS)
    expect(out).toContain('const label = "react"')
    expect(out).toContain("const spec = 'react-dom'")
    expect(out).toContain('from "https://app/jsxRuntimeShim.js"')
  })

  it('cubre los externals que el CLI deja afuera', () => {
    expect(BUNDLE_EXTERNALS).toContain('react')
    expect(BUNDLE_EXTERNALS).toContain('react/jsx-runtime')
    expect(BUNDLE_EXTERNALS).toContain('@features/layout')
  })
})

describe('providedModuleSource', () => {
  const REGISTRY = '__SCRAKK_PROVIDED__'

  it('re-exporta todos los nombres del namespace, incluido default', () => {
    const source = providedModuleSource(
      { useState: () => 1, Fragment: {}, default: {} },
      'react/jsx-runtime'
    )
    expect(source).toContain(`globalThis["${REGISTRY}"]["react/jsx-runtime"]`)
    expect(source).toContain('export { n0 as useState };')
    expect(source).toContain('export { n1 as Fragment };')
    expect(source).toContain('export { n2 as default };')
  })

  it('soporta nombres que no son identificadores', () => {
    const source = providedModuleSource({ 'no-ident': 1 }, 'x')
    expect(source).toContain('export { n0 as "no-ident" };')
  })

  it('el módulo generado exporta el namespace REAL (mismas funciones)', async () => {
    // Es el punto del diseño: la extensión tiene que recibir la MISMA copia de
    // React que la app (con otra, los hooks no comparten dispatcher). En el
    // build, además, los nombres tienen que sobrevivir al recorte del bundler.
    const namespace = (await import('react')) as Record<string, unknown>
    ;(globalThis as Record<string, unknown>)[REGISTRY] = { react: namespace }

    const source = providedModuleSource(namespace, 'react')
    const file = join(mkdtempSync(join(tmpdir(), 'sef-provided-')), 'module.mjs')
    writeFileSync(file, source, 'utf-8')

    const generated = (await import(pathToFileURL(file).href)) as Record<string, unknown>
    expect(generated.useState).toBe(namespace.useState)
    expect(generated.useEffect).toBe(namespace.useEffect)
    expect(generated.createElement).toBe(namespace.createElement)
  })
})

describe('createBundleModuleUrl', () => {
  it('devuelve una URL de BLOB, nunca data: (la CSP bloquea data: en scripts)', async () => {
    const blobs: Blob[] = []
    const url = createBundleModuleUrl('export const modules = {}', {
      createObjectURL: (blob) => {
        blobs.push(blob)
        return 'blob:http://localhost:5173/6f1c'
      }
    })

    expect(url.startsWith('blob:')).toBe(true)
    expect(url.startsWith('data:')).toBe(false)
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('text/javascript')
    expect(await blobs[0].text()).toBe('export const modules = {}')
  })
})

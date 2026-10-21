// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tooltip: si el puntero está ENCIMA, el tooltip se queda quieto.
 *
 * Lo que se rompe en silencio: el hover de LSP aparece, el usuario moves el
 * mouse hacia arriba para leerlo (o seleccionar el código que trae) y a los
 * 300ms el tooltip se mata — porque el editor ya no ve el puntero sobre el
 * canvas. El contenido es para LEER: si el puntero está encima, se queda.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const HOST = 'src/renderer/src/services/tooltips/TooltipHost.tsx'
const CSS = 'src/renderer/src/services/tooltips/TooltipHost.module.css'
const BRIDGE = 'src/renderer/src/features/editor/engines/innerta/hostBridge.ts'

describe('tooltip: quieto bajo el puntero', () => {
  const src = read(HOST)

  it('el hide normal NO oculta si el puntero está encima', () => {
    expect(src).toContain('hoveredRef.current = true')
    expect(src).toContain('if (hoveredRef.current) return')
  })

  it('entrar al tooltip cancela el timer de ocultar', () => {
    expect(src).toContain('onPointerEnter')
    expect(src).toContain('clearHideTimer()')
  })

  it('salir del tooltip lo oculta', () => {
    expect(src).toContain('onPointerLeave')
  })

  it('hay un hide forzado para scroll/click', () => {
    expect(src).toContain('HIDE_FORCE_EVENT')
    expect(src).toContain("window.addEventListener('scroll', onScroll, true)")
  })

  it('scrollear DENTRO del tooltip no lo mata', () => {
    // El scroll no burbujea: el listener va en capture, así que sin mirar el
    // target el scroll interno del tooltip lo mataba.
    expect(src).toContain('ref.current?.contains(target)')
  })

  it('la rueda sobre el tooltip no scrollea el editor', () => {
    expect(src).toContain("addEventListener('wheel'")
    expect(src).toContain('event.stopPropagation()')
  })

  it('el tooltip se pone AL LADO del puntero, no debajo', () => {
    expect(src).toContain('tooltip.clientX + gap')
    expect(src).toContain('tooltip.clientY + gap')
  })

  it('el tooltip markdown es interactivo (se puede entrar y seleccionar)', () => {
    expect(read(CSS)).toMatch(/\.tooltipMarkdown\s*\{[^}]*pointer-events:\s*auto/)
  })
})

describe('el editor deja el tooltip vivo', () => {
  const src = read(BRIDGE)

  it('el click en el canvas lo saca (forzado)', () => {
    expect(src).toContain('hideTooltipForce()')
  })

  it('salir del canvas usa el hide normal (respeta el hover)', () => {
    expect(src).toContain('setTimeout(hideTooltip, 300)')
  })
})

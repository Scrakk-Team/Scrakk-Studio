// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ProductIcons — <ProductIcon> + factory de componentes.
 * Separado en .tsx porque index.ts no admite JSX.
 */

import type { ComponentType, CSSProperties, JSX } from 'react'
import { useEffect, useState } from 'react'
import { resolveProductIcon, subscribeToProductIcons } from './registry'
import { builtinComponentFor, fallbackComponent } from './builtin'

export interface ProductIconProps {
  /** Id canónico (codicon-compatible): "folder", "close", "search"… */
  id: string
  size?: number
  className?: string
  style?: CSSProperties
  /** Props extra (aria-*, data-*) que se reenvían al svg/glyph. */
  [prop: string]: unknown
}

/**
 * Icono UI reactivo: glyph del tema activo si lo define, componente builtin
 * en caso contrario, fallback genérico si el id es desconocido.
 * Se suscribe solo: cualquier superficie se actualiza al cambiar el tema
 * sin que el host tenga que suscribirse.
 *
 * Anti-tofu: tras asentar la carga de la fuente se verifica con la Font
 * Loading API que el glyph EXISTA en la fuente. Si no está cubierto (fuente
 * corrupta, codepoint fuera del font), se pinta el builtin en vez de un
 * cuadrado permanente.
 */
export function ProductIcon({ id, size = 16, className, style, ...rest }: ProductIconProps): JSX.Element {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeToProductIcons(() => setVersion((v) => v + 1)), [])
  void version

  const resolved = resolveProductIcon(id)
  const fontKey =
    resolved?.kind === 'font' ? `${resolved.family}:${resolved.char}` : null
  const [fontCovered, setFontCovered] = useState(true)

  useEffect(() => {
    if (!fontKey || typeof document === 'undefined') {
      setFontCovered(true)
      return
    }
    if (resolved?.kind !== 'font') {
      setFontCovered(true)
      return
    }
    const { family, char } = resolved
    let cancelled = false
    const spec = `16px '${family}'`
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    const check = (): boolean => {
      try {
        return fonts ? fonts.check(spec, char) : true
      } catch {
        return true
      }
    }
    // Mientras carga (font-display: block) se pinta el glyph; solo si al
    // asentar la carga sigue sin cubrirse se cae al builtin.
    try {
      void Promise.resolve(fonts ? fonts.load(spec, char) : [])
        .catch(() => [])
        .then(() => {
          if (!cancelled) setFontCovered(check())
        })
    } catch {
      // Sin Font Loading API: confiar en el glyph.
    }
    // Si la fuente llega TARDE (inyectada después, @font-face diferido), el
    // check inicial ya cayó a builtin: re-chequear cuando asiente CUALQUIER
    // carga para recuperar el glyph real sin necesitar re-mount.
    const onLoadingDone = (): void => {
      if (!cancelled) setFontCovered(check())
    }
    try {
      fonts?.addEventListener?.('loadingdone', onLoadingDone)
    } catch {
      // FontFaceSet sin eventos: se queda el resultado del check inicial.
    }
    return () => {
      cancelled = true
      try {
        fonts?.removeEventListener?.('loadingdone', onLoadingDone)
      } catch {
        // Limpieza best-effort.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey])

  if (resolved?.kind === 'font' && fontCovered) {
    const { color: _color, ...ariaRest } = rest as { color?: unknown }
    void _color
    return (
      <span
        className={className}
        aria-hidden="true"
        style={{
          fontFamily: `'${resolved.family}'`,
          fontSize: size,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          flexShrink: 0,
          color: 'inherit',
          ...style
        }}
        {...ariaRest}
      >
        {resolved.char}
      </span>
    )
  }
  const Comp =
    (resolved?.kind === 'component' ? builtinComponentFor(resolved.componentId) : null) ??
    fallbackComponent()
  const Loose = Comp as ComponentType<Record<string, unknown>>
  return <Loose size={size} className={className} style={style} {...rest} />
}

/**
 * Envuelve un id en un ComponentType<{size}> para superficies que solo
 * entienden componentes (ActivityBarButton.icon, TabStrip iconFor…).
 */
export function productIcon(id: string): ComponentType<{ size?: number }> {
  const Comp = ({ size }: { size?: number }): JSX.Element => (
    <ProductIcon id={id} size={size ?? 16} />
  )
  Comp.displayName = `ProductIcon(${id})`
  return Comp
}

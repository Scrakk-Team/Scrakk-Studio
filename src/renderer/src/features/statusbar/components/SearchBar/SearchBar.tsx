// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SearchBar — trigger de la Command Palette en la statusbar.
 *
 * Click (o mod+shift+p) abre la paleta. El input real vive en el overlay.
 *
 * El trigger va centrado en la barra (position: absolute), así que cuando la
 * ventana se angosta terminaría pisando los chips de la izquierda o los de la
 * derecha. Para evitarlo mide el hueco real entre ambos grupos y se adapta:
 *   - ancho cómodo → icono + "Comandos";
 *   - hueco chico → se angosta (el label se recorta);
 *   - sin hueco → se vuelve un botón-icono, como la campana/ajustes;
 *   - sin hueco ni para el icono → no se pinta.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { openCommandPalette } from '@services/commands'
import styles from './SearchBar.module.css'

import { t } from '@core/i18n'
/** Ancho cómodo del trigger completo (icono + "Comandos"). */
const FULL_WIDTH = 220
/** Por debajo de esto el trigger se vuelve un botón-icono. */
const COMPACT_BELOW = 120
/** Separación mínima con cada grupo vecino. */
const GAP = 8
/** Ancho del botón-icono (se recorta si hay menos hueco). */
const ICON_WIDTH = 28
/** Sin hueco ni para el icono: mejor no pintar nada que superponerse. */
const MIN_VISIBLE = 24

export function SearchBar(): JSX.Element | null {
  const ref = useRef<HTMLButtonElement | null>(null)
  const [available, setAvailable] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const bar = el?.parentElement
    if (!el || !bar) return

    const first = bar.firstElementChild as HTMLElement | null
    const last = bar.lastElementChild as HTMLElement | null

    const measure = (): void => {
      const barRect = bar.getBoundingClientRect()
      const center = barRect.left + barRect.width / 2
      const leftEdge = first && first !== el ? first.getBoundingClientRect().right : barRect.left
      const rightEdge = last && last !== el ? last.getBoundingClientRect().left : barRect.right
      // Centrado: el ancho máximo que no toca ninguno de los dos lados es el
      // doble del menor de los huecos, menos un margen a cada lado.
      setAvailable(2 * Math.min(center - leftEdge, rightEdge - center) - GAP * 2)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    if (first && first !== el) ro.observe(first)
    if (last && last !== el) ro.observe(last)
    return () => ro.disconnect()
  }, [])

  if (available !== null && available < MIN_VISIBLE) return null

  const compact = available !== null && available < COMPACT_BELOW
  const width =
    available === null
      ? undefined
      : compact
        ? Math.min(ICON_WIDTH, available)
        : Math.min(FULL_WIDTH, available)
  const style: CSSProperties | undefined =
    width === undefined ? undefined : { width: `${width}px`, minWidth: 0 }

  return (
    <button
      ref={ref}
      type="button"
      className={[styles.wrapper, compact ? styles.compact : null].filter(Boolean).join(' ')}
      style={style}
      onClick={() => openCommandPalette()}
      title={t('statusbar.paleta.de.comandos.mod.shift')}
      aria-label={t('statusbar.abrir.paleta.de.comandos')}
    >
      <ProductIcon id="search" size={12} className={styles.icon} aria-hidden="true" />
      {compact ? null : <span className={styles.label}>{t('statusbar.comandos')}</span>}
    </button>
  )
}

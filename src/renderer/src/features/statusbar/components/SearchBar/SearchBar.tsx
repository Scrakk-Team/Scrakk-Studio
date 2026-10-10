// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SearchBar — trigger de la Command Palette en la statusbar.
 *
 * Click (o mod+shift+p) abre la paleta. El input real vive en el overlay.
 *
 * El trigger va centrado en la barra (position: absolute). Para que la ventana
 * angosta no lo haga pisar los chips de al lado mide el hueco real entre ambos
 * grupos: usa TODO el hueco (si hay lugar a la derecha no se encoge de más) y,
 * cuando el ancho llega a su tope, se corre a la izquierda hasta pegarse al
 * grupo de los chips. En el extremo:
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
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)

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
      // Ancho máximo que no toca ninguno de los dos grupos (usa TODO el hueco,
      // así si hay lugar a la derecha no se encoge de más).
      const width = Math.min(FULL_WIDTH, rightEdge - leftEdge - GAP * 2)
      // Centrada mientras sobra lugar; cuando el ancho llegó a su tope, se corre
      // a la izquierda hasta quedar pegada al grupo de los chips.
      const left = Math.min(Math.max(center - width / 2, leftEdge + GAP), rightEdge - GAP - width)
      setBox({ left: left - barRect.left, width })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    if (first && first !== el) ro.observe(first)
    if (last && last !== el) ro.observe(last)
    return () => ro.disconnect()
  }, [])

  if (box !== null && box.width < MIN_VISIBLE) return null

  const compact = box !== null && box.width < COMPACT_BELOW
  const width = box === null ? 0 : compact ? Math.min(ICON_WIDTH, box.width) : box.width
  const style: CSSProperties | undefined =
    box === null
      ? undefined
      : {
          left: `${box.left}px`,
          width: `${width}px`,
          transform: 'translateY(-50%)',
          minWidth: 0
        }

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

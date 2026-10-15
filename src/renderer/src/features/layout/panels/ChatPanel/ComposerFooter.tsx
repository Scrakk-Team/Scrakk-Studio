// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ComposerFooter — fila de controles debajo del input de chat.
 *
 * Orden visual: modo · skills · (espacio) · pensamiento · modelo.
 * Cuando el panel se angosta, los controles del centro se ocultan y quedan
 * disponibles en el botón de 3 puntos (⋯): primero skills, luego pensamiento,
 * y por último el modelo. El modo (extremo izquierdo) queda siempre.
 *
 * El ancho del footer es estable (min(680px, 100%)); solo se observa ese
 * ancho y se decide por umbrales fijos, sin medir a los hijos (evita bucles
 * de render).
 */

import { memo, useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { ContextMenu, type ContextMenuItem } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import { ModeLabel } from '@features/chat'
import { ModelPicker, useModelMenuItems } from '@features/providers'
import { applyVariant, getAvailableVariants } from '@features/chat/commands/variants/logic'
import { skillRegistry } from '@services/skills'
import { toggleSkillsView } from '../SkillsPanel/viewState'
import { SkillsButton } from './SkillsButton'
import { VariantsButton } from './VariantsButton'
import styles from './ChatPanel.module.css'

import { t } from '@core/i18n'
/** Umbrales de ancho del footer (px) por debajo de los cuales se oculta. */
const HIDE_SKILLS = 400
const HIDE_VARIANTS = 350
const HIDE_MODEL = 300

export const ComposerFooter = memo(function ComposerFooter({ variant }: { variant: string }): JSX.Element {
  const footerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [skillCount, setSkillCount] = useState(() => skillRegistry.list().length)
  const modelItems = useModelMenuItems()

  useEffect(() => {
    skillRegistry.start()
    return skillRegistry.subscribe(() => setSkillCount(skillRegistry.list().length))
  }, [])

  // Ancho disponible: es estable, así que no hay ida y vuelta con el layout.
  useLayoutEffect(() => {
    const el = footerRef.current
    if (!el) return
    const update = (): void => {
      const next = el.getBoundingClientRect().width
      setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const showSkills = width === 0 || width >= HIDE_SKILLS
  const showVariants = width === 0 || width >= HIDE_VARIANTS
  const showModel = width === 0 || width >= HIDE_MODEL
  const hasMore = !showSkills || !showVariants || !showModel

  const openMore = (event: MouseEvent<HTMLButtonElement>): void => {
    if (anchor) {
      setAnchor(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setAnchor({ x: rect.left, y: rect.top })
  }

  const menuItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    if (!showSkills) {
      items.push({
        label: t('layout.skills'),
        sublabel: `${skillCount} cargadas`,
        icon: <ProductIcon id="layers" size={13} aria-hidden="true" />,
        onClick: () => toggleSkillsView()
      })
    }
    if (!showVariants) {
      items.push({ label: t('layout.pensamiento'), disabled: true, separatorBefore: items.length > 0 })
      const info = getAvailableVariants()
      if (!info.catalogReady) {
        items.push({ label: t('layout.cargando.catalogo'), disabled: true })
      } else if (info.options.length === 0) {
        items.push({ label: t('layout.el.modelo.no.declara.variantes'), disabled: true })
      } else {
        items.push({
          label: t('layout.automatica'),
          checked: info.current === '',
          onClick: () => applyVariant('auto')
        })
        for (const value of info.options) {
          items.push({
            label: value,
            checked: info.current === value,
            onClick: () => applyVariant(value)
          })
        }
      }
    }
    if (!showModel) {
      items.push({ label: t('layout.modelo'), disabled: true, separatorBefore: items.length > 0 })
      items.push(...modelItems)
    }
    return items
  }

  return (
    <div className={styles.composerFooter} ref={footerRef}>
      <div className={styles.footerSlot}>
        <ModeLabel />
      </div>

      {showSkills ? (
        <div className={styles.footerSlot}>
          <SkillsButton />
        </div>
      ) : null}

      <div className={styles.composerFooterSpacer} aria-hidden="true" />

      {showVariants ? (
        <div className={styles.footerSlot}>
          <VariantsButton variant={variant} />
        </div>
      ) : null}

      {showModel ? (
        <div className={styles.footerSlot}>
          <ModelPicker />
        </div>
      ) : null}

      {hasMore ? (
        <button
          type="button"
          className={styles.moreBtn}
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          title={t('layout.mas.opciones')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={openMore}
        >
          <ProductIcon id="more" size={14} aria-hidden="true" />
        </button>
      ) : null}

      {anchor ? (
        <ContextMenu
          items={menuItems()}
          x={anchor.x}
          y={anchor.y}
          placement="above"
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </div>
  )
})

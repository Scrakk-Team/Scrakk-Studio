// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Herramientas" — activa/desactiva tools, agrupadas por
 * **Familia → Tipo** (catálogo extensible, ver `services/ai/tools/catalog.ts`).
 *
 * Cada **familia** (la categoría) es un grupo PLEGABLE y las tools de adentro se
 * ven en tarjetas EN HORIZONTAL (grid que se acomoda al ancho): con decenas de
 * tools, una lista vertical de renglones largos era imposible de leer.
 *
 * Desactivar una tool la saca del prompt y del request (el modelo no la ve);
 * el executor además la rechaza por si el modelo la llama igual. La lista se
 * arma del registry EN VIVO, así las tools de extensiones (y sus packs)
 * aparecen solas.
 */

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { ToggleSwitch } from '@ui'
import { registry } from '@services/ai/tools'
import { toolCatalog, DEFAULT_TOOL_TYPE } from '@services/ai/tools/catalog'
import { toolSettingsService } from '@services/ai/toolSettings'
import styles from './ChatSections.module.css'

import { t } from '@core/i18n'
type ToolRow = ReturnType<typeof toolSettingsService.getAllTools>[number]

export function ToolsSection(): JSX.Element {
  const [tools, setTools] = useState<ToolRow[]>(() => toolSettingsService.getAllTools())
  const [version, setVersion] = useState(0)
  /** Familias plegadas por el usuario (por id): arriba arrancan todas abiertas. */
  const [collapsed, setCollapsed] = useState<string[]>([])

  useEffect(() => {
    const reload = (): void => setTools(toolSettingsService.getAllTools())
    const unsubRegistry = registry.subscribe(reload)
    const unsubCatalog = toolCatalog.subscribe(() => setVersion((v) => v + 1))
    window.addEventListener('tool-settings-changed', reload)
    return () => {
      unsubRegistry()
      unsubCatalog()
      window.removeEventListener('tool-settings-changed', reload)
    }
  }, [])
  void version

  const typeOf = (tool: ToolRow): string => tool.meta.type || DEFAULT_TOOL_TYPE

  const toggleFamily = (id: string): void =>
    setCollapsed((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    )

  const renderTool = (tool: ToolRow): JSX.Element => (
    <div key={tool.name} className={styles.toolCard}>
      <div className={styles.toolCardTop}>
        <span className={styles.rowTitle}>
          {tool.meta.label}
          {tool.extensionId ? <span className={styles.badge}>{t('settings.extension')}</span> : null}
          {tool.meta.dangerLevel === 'high' ? (
            <span className={`${styles.badge} ${styles.badgeDanger}`}>{t('settings.riesgo.alto')}</span>
          ) : null}
        </span>
        <ToggleSwitch
          checked={tool.enabled}
          onChange={(next) => toolSettingsService.setGloballyEnabled(tool.name, next)}
          label={`Habilitar ${tool.meta.label}`}
        />
      </div>
      <span className={styles.rowDesc}>{tool.meta.description || tool.name}</span>
    </div>
  )

  const knownTypes = new Set(toolCatalog.listTypes().map((type) => type.id))
  const orphans = tools.filter((tool) => !knownTypes.has(typeOf(tool)))

  /** Grupo plegable: encabezado con chevron + contador, y el cuerpo adentro. */
  const renderGroup = (id: string, label: string, count: number, body: JSX.Element[]): JSX.Element => {
    const isOpen = !collapsed.includes(id)
    return (
      <div key={id} className={styles.group}>
        <button
          type="button"
          className={styles.groupHeader}
          aria-expanded={isOpen}
          aria-label={isOpen ? `Contraer ${label}` : `Desplegar ${label}`}
          onClick={() => toggleFamily(id)}
        >
          <span className={isOpen ? styles.chevronOpen : styles.chevron} aria-hidden="true">
            <ProductIcon id="chevron-right" size={12} />
          </span>
          <span className={styles.groupTitle}>{label}</span>
          <span className={styles.groupCount}>{count}</span>
        </button>
        {isOpen ? <div className={styles.groupBody}>{body}</div> : null}
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <p className={styles.hint}>{t('settings.elige.que.herramientas.puede.usar')}</p>

      {toolCatalog.listFamilies().map((family) => {
        const groups = toolCatalog
          .listTypes(family.id)
          .map((type) => ({ type, list: tools.filter((tool) => typeOf(tool) === type.id) }))
          .filter((group) => group.list.length > 0)
        if (groups.length === 0) return null

        const count = groups.reduce((total, group) => total + group.list.length, 0)
        const body = groups.map(({ type, list }) => {
          const allEnabled = list.every((tool) => tool.enabled)
          return (
            <div key={type.id} className={styles.typeGroup}>
              <div className={styles.typeHeader}>
                <span className={styles.typeLabel}>
                  {type.icon ? <ProductIcon id={type.icon} size={12} aria-hidden="true" /> : null}
                  {type.label}
                </span>
                <ToggleSwitch
                  checked={allEnabled}
                  onChange={(next) => {
                    for (const tool of list) {
                      toolSettingsService.setGloballyEnabled(tool.name, next)
                    }
                  }}
                  label={`Habilitar todo el grupo ${type.label}`}
                />
              </div>
              <div className={styles.toolCards}>{list.map(renderTool)}</div>
            </div>
          )
        })

        return renderGroup(family.id, family.label, count, body)
      })}

      {orphans.length > 0
        ? renderGroup(
            'sin-grupo',
            t('settings.sin.grupo'),
            orphans.length,
            [<div key="orphans" className={styles.toolCards}>{orphans.map(renderTool)}</div>]
          )
        : null}
    </div>
  )
}

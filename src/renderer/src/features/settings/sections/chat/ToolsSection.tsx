// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Herramientas" — activa/desactiva tools, agrupadas por
 * **Familia → Tipo** (catálogo extensible, ver `services/ai/tools/catalog.ts`).
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

type ToolRow = ReturnType<typeof toolSettingsService.getAllTools>[number]

export function ToolsSection(): JSX.Element {
  const [tools, setTools] = useState<ToolRow[]>(() => toolSettingsService.getAllTools())
  const [version, setVersion] = useState(0)

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

  const renderTool = (tool: ToolRow): JSX.Element => (
    <div key={tool.name} className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>
          {tool.meta.label}
          {tool.extensionId ? <span className={styles.badge}>extensión</span> : null}
          {tool.meta.dangerLevel === 'high' ? (
            <span className={`${styles.badge} ${styles.badgeDanger}`}>riesgo alto</span>
          ) : null}
        </span>
        <span className={styles.rowDesc}>{tool.meta.description || tool.name}</span>
      </div>
      <ToggleSwitch
        checked={tool.enabled}
        onChange={(next) => toolSettingsService.setGloballyEnabled(tool.name, next)}
        label={`Habilitar ${tool.meta.label}`}
      />
    </div>
  )

  const knownTypes = new Set(toolCatalog.listTypes().map((type) => type.id))
  const orphans = tools.filter((tool) => !knownTypes.has(typeOf(tool)))

  return (
    <div className={styles.section}>
      <p className={styles.hint}>Elige qué herramientas puede usar la IA.</p>

      {toolCatalog.listFamilies().map((family) => {
        const groups = toolCatalog
          .listTypes(family.id)
          .map((type) => ({ type, list: tools.filter((tool) => typeOf(tool) === type.id) }))
          .filter((group) => group.list.length > 0)
        if (groups.length === 0) return null
        return (
          <div key={family.id} className={styles.group}>
            <span className={styles.groupLabel}>{family.label}</span>
            {groups.map(({ type, list }) => {
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
                  <div className={styles.list}>{list.map(renderTool)}</div>
                </div>
              )
            })}
          </div>
        )
      })}

      {orphans.length > 0 ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Sin grupo</span>
          <div className={styles.list}>{orphans.map(renderTool)}</div>
        </div>
      ) : null}
    </div>
  )
}

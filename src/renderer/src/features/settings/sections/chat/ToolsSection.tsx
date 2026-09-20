/**
 * Sección "Herramientas" — activa/desactiva cada tool de la IA.
 *
 * Desactivar una tool la saca del prompt y del request (el modelo no la ve);
 * el executor además la rechaza por si el modelo la llama igual. La lista se
 * arma del registry EN VIVO, así las tools de extensiones aparecen solas.
 */

import { useEffect, useState, type JSX } from 'react'
import { ToggleSwitch } from '@ui'
import { registry } from '@services/ai/tools'
import { toolSettingsService } from '@services/ai/toolSettings'
import styles from './ChatSections.module.css'

type ToolRow = ReturnType<typeof toolSettingsService.getAllTools>[number]

export function ToolsSection(): JSX.Element {
  const [tools, setTools] = useState<ToolRow[]>(() => toolSettingsService.getAllTools())

  useEffect(() => {
    const reload = (): void => setTools(toolSettingsService.getAllTools())
    const unsubscribe = registry.subscribe(reload)
    window.addEventListener('tool-settings-changed', reload)
    return () => {
      unsubscribe()
      window.removeEventListener('tool-settings-changed', reload)
    }
  }, [])

  const categories = toolSettingsService.getCategoryOrder()

  const grouped = categories.map((category) => ({
    ...category,
    tools: tools.filter((tool) => (tool.meta.category ?? 'utility') === category.key)
  }))

  const known = new Set(categories.map((category) => category.key))
  const others = tools.filter((tool) => !known.has(tool.meta.category ?? 'utility'))

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

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        Elige qué herramientas puede usar la IA.
      </p>

      {grouped.map((category) =>
        category.tools.length === 0 ? null : (
          <div key={category.key} className={styles.group}>
            <span className={styles.groupLabel}>{category.label}</span>
            <div className={styles.list}>{category.tools.map(renderTool)}</div>
          </div>
        )
      )}

      {others.length > 0 ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Otras</span>
          <div className={styles.list}>{others.map(renderTool)}</div>
        </div>
      ) : null}
    </div>
  )
}

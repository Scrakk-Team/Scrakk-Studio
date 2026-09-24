// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Vista de ÁRBOL de una extensión — el otro sabor de panel de la activity bar.
 *
 * La extensión NO publica HTML: sirve nodos (`registerTreeDataProvider` /
 * `createTreeView`) y el IDE los pinta. El renderer nunca recibe los objetos
 * originales (un `Uri` no sobrevive a la serialización), así que:
 *
 *   - los hijos se piden por `id` opaco: `treeChildren(viewId, elementId)`
 *   - el click manda `treeSelect(viewId, elementId)` y el HOST corre el comando
 *     del item con sus argumentos REALES
 *
 * El árbol se guarda por nodos expandidos (no se copia el árbol entero), así
 * que un `view/tree-change` de la extensión sólo invalida lo que corresponde:
 * sin argumento se recarga la raíz, con `elementId` ese nodo.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { TreeNodeModel } from '@shared/extensionHost/protocol'
import {
  hasWelcomeContent,
  parseWelcomeContents,
  type WelcomePart
} from '@shared/compatibility/vscode/welcome'
import { evaluateWhen } from '@services/extensions/when'
import { getExtensionContextKey } from '@services/extensions/hostBridge'
import { getHostBridge } from './panelBridge'
import type { ContainerWelcome } from './containers'
import styles from './ExtensionTreeView.module.css'

interface ExtensionTreeViewProps {
  extensionId: string
  viewId: string
  /** `viewsWelcome` de la vista (lo que la extensión declaró para el vacío). */
  welcome?: ContainerWelcome[]
}

export function ExtensionTreeView({
  extensionId,
  viewId,
  welcome
}: ExtensionTreeViewProps): JSX.Element {
  const [root, setRoot] = useState<TreeNodeModel[] | null>(null)
  const [children, setChildren] = useState<Map<string, TreeNodeModel[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  /** Comando del welcome corriendo (para no dispararlo dos veces). */
  const [runningCommand, setRunningCommand] = useState<string | null>(null)

  // Refs espejo: los handlers de eventos no deben re-suscribirse en cada
  // cambio de estado (perderían un refresh que llegó justo en el medio).
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const reloadRef = useRef<() => void>(() => undefined)

  const loadChildren = useCallback(
    async (elementId: string | null): Promise<TreeNodeModel[]> => {
      const host = getHostBridge()
      if (!host) throw new Error('El puente nativo no está disponible en este entorno.')
      const response = await host.treeChildren({ id: extensionId, viewId, elementId })
      if (!response.success) throw new Error(response.error ?? 'La extensión no devolvió nodos.')
      return response.nodes ?? []
    },
    [extensionId, viewId]
  )

  const reload = useCallback((): void => {
    void (async () => {
      try {
        const nodes = await loadChildren(null)
        setRoot(nodes)
        setError(null)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      }
    })()
  }, [loadChildren])

  reloadRef.current = reload

  // ── Carga inicial de la raíz ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const nodes = await loadChildren(null)
        if (!cancelled) {
          setRoot(nodes)
          setError(null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadChildren])

  // ── Refrescos que pide la extensión ─────────────────────────────────────
  useEffect(() => {
    const host = getHostBridge()
    if (!host) return
    return host.onEvent((message) => {
      if (message.extensionId !== extensionId) return
      const payload = message.payload as
        | { viewId?: string; nodes?: TreeNodeModel[]; elementId?: string }
        | undefined
      if (payload?.viewId !== viewId) return

      if (message.event === 'view/tree') {
        setRoot(payload.nodes ?? [])
        return
      }
      if (message.event !== 'view/tree-change') return

      // Sin elemento: cambió todo → recargar la raíz.
      if (!payload.elementId) {
        reloadRef.current()
        return
      }
      // Con elemento: sólo ese nodo (si está abierto, se piden sus hijos).
      const elementId = payload.elementId
      const wasExpanded = expandedRef.current.has(elementId)
      setChildren((current) => {
        const next = new Map(current)
        next.delete(elementId)
        return next
      })
      if (!wasExpanded) return
      void (async () => {
        try {
          const nodes = await loadChildren(elementId)
          setChildren((current) => new Map(current).set(elementId, nodes))
        } catch {
          // Un refresh que falla no borra lo que ya se ve.
        }
      })()
    })
  }, [extensionId, viewId, loadChildren])

  // ── Interacción ─────────────────────────────────────────────────────────

  const toggle = useCallback(
    (node: TreeNodeModel): void => {
      const isOpen = expanded.has(node.id)
      setExpanded((current) => {
        const next = new Set(current)
        if (isOpen) next.delete(node.id)
        else next.add(node.id)
        return next
      })
      if (isOpen || children.has(node.id)) return

      setLoading((current) => new Set(current).add(node.id))
      void (async () => {
        try {
          const nodes = await loadChildren(node.id)
          setChildren((current) => new Map(current).set(node.id, nodes))
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        } finally {
          setLoading((current) => {
            const next = new Set(current)
            next.delete(node.id)
            return next
          })
        }
      })()
    },
    [children, expanded, loadChildren]
  )

  const runWelcomeCommand = useCallback(
    (part: Extract<WelcomePart, { kind: 'command' }>): void => {
      const host = getHostBridge()
      if (!host) return
      setRunningCommand(part.command)
      void (async () => {
        try {
          // El comando se ejecuta EN la extensión: es SU comando, con SUS
          // argumentos (los del `viewsWelcome`, ya parseados).
          const result = await host.executeCommand({
            id: extensionId,
            command: part.command,
            args: part.args
          })
          if (!result.success) setError(result.error)
        } catch (commandError) {
          setError(commandError instanceof Error ? commandError.message : String(commandError))
        } finally {
          setRunningCommand(null)
        }
      })()
    },
    [extensionId]
  )

  const runNode = useCallback(
    (node: TreeNodeModel): void => {
      if (!node.command) return
      const host = getHostBridge()
      if (!host) return
      void (async () => {
        const result = await host.treeSelect({
          id: extensionId,
          viewId,
          elementId: node.id
        })
        if (!result.success) setError(result.error ?? 'El comando del nodo falló.')
      })()
    },
    [extensionId, viewId]
  )

  if (error && root === null) {
    return (
      <div className={styles.state} role="status">
        <p className={styles.error}>{error}</p>
        <p className={styles.hint}>
          Extensión <code>{extensionId}</code> · Vista <code>{viewId}</code>
        </p>
      </div>
    )
  }

  if (root === null) {
    return (
      <div className={styles.state} role="status">
        <p className={styles.hint}>Cargando el árbol de la extensión…</p>
      </div>
    )
  }

  if (root.length === 0) {
    // El vacío lo explica LA EXTENSIÓN (`viewsWelcome`) cuando lo declaró: su
    // texto y sus botones de comando, no nuestro mensaje genérico.
    return (
      <WelcomeContent
        welcome={welcome}
        runningCommand={runningCommand}
        onCommand={runWelcomeCommand}
      />
    )
  }

  const rows: JSX.Element[] = []
  const walk = (nodes: TreeNodeModel[], depth: number): void => {
    for (const node of nodes) {
      const isOpen = expanded.has(node.id)
      const collapsible = node.collapsible > 0
      rows.push(
        <div
          key={node.id}
          className={[styles.row, node.command ? styles.clickable : null].filter(Boolean).join(' ')}
          data-tree-node={node.id}
          data-context-value={node.contextValue}
          style={{ paddingLeft: 6 + depth * 12 }}
          title={node.tooltip ?? node.label}
          role="treeitem"
          aria-expanded={collapsible ? isOpen : undefined}
          // Click en la fila: si el nodo tiene comando se corre (como VS Code);
          // si no, se despliega/pliega.
          onClick={() => {
            if (node.command) runNode(node)
            else if (collapsible) toggle(node)
          }}
        >
          {collapsible ? (
            <button
              type="button"
              className={styles.twisty}
              aria-label={isOpen ? 'Contraer' : 'Expandir'}
              onClick={(event) => {
                event.stopPropagation()
                toggle(node)
              }}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path
                  d={isOpen ? 'M3 6l5 5 5-5' : 'M6 3l5 5-5 5'}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            <span className={styles.twistySpacer} />
          )}
          <TreeIcon icon={node.icon} />
          <span className={styles.label}>{node.label}</span>
          {node.description ? <span className={styles.description}>{node.description}</span> : null}
          {loading.has(node.id) ? <span className={styles.spinner} aria-hidden="true" /> : null}
        </div>
      )

      if (collapsible && isOpen) {
        const kids = children.get(node.id)
        if (kids && kids.length > 0) walk(kids, depth + 1)
      }
    }
  }

  walk(root, 0)

  return (
    <div className={styles.tree} role="tree" aria-label="Árbol de la extensión">
      {rows}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}

/**
 * Icono del nodo. Los assets del paquete sí se sirven (`scrakk-ext://`), pero
 * los `ThemeIcon` son codicons: aquí queda un punto neutro hasta que exista el
 * mapeo a los productIcons del tema (mejor un punto que un hueco raro).
 */
/**
 * Contenido de la vista VACÍA.
 *
 * Se muestran las entradas de `viewsWelcome` cuyo `when` da verdadero (las
 * claves de contexto las publica la extensión con `setContext`). Si la
 * extensión no declaró nada —o declaró algo que no dice nada— queda el
 * mensaje del IDE: nunca un panel vacío del todo.
 */
function WelcomeContent({
  welcome,
  runningCommand,
  onCommand
}: {
  welcome?: ContainerWelcome[]
  runningCommand: string | null
  onCommand: (part: Extract<WelcomePart, { kind: 'command' }>) => void
}): JSX.Element {
  const parts = useMemo<WelcomePart[]>(() => {
    const active = (welcome ?? []).filter((entry) =>
      evaluateWhen(entry.when, getExtensionContextKey)
    )
    return active.flatMap((entry) => parseWelcomeContents(entry.contents))
  }, [welcome])

  if (!hasWelcomeContent(parts)) {
    return (
      <div className={styles.state} role="status">
        <p className={styles.hint}>La extensión no devolvió nodos.</p>
      </div>
    )
  }

  return (
    <div className={styles.welcome} role="status" data-ext-welcome="1">
      {parts.map((part, index) =>
        part.kind === 'text' ? (
          <p key={`t${index}`} className={styles.welcomeText}>
            {part.text}
          </p>
        ) : (
          <button
            key={`c${index}`}
            type="button"
            className={styles.welcomeAction}
            disabled={runningCommand !== null}
            // El botón del welcome es el comando REAL de la extensión.
            onClick={() => onCommand(part)}
          >
            {part.label}
          </button>
        )
      )}
    </div>
  )
}

function TreeIcon({ icon }: { icon: TreeNodeModel['icon'] }): JSX.Element | null {
  if (!icon) return null
  if (icon.kind === 'url') {
    return <img className={styles.icon} src={icon.url} alt="" width={14} height={14} />
  }
  return <span className={styles.iconDot} aria-hidden="true" />
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Outline — esquema del archivo activo (panel del ToolDock).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALEN LOS SÍMBOLOS (en este orden)
 *
 * 1. **Árbol de sintaxis del paquete** (`tags.scm` de la extensión de lenguaje,
 *    corrido en el proceso del parser dinámico). Es la fuente buena: los
 *    símbolos vienen del árbol REAL, con su anidado por contención de rangos,
 *    así que un método aparece dentro de su clase sin que nadie lo declare. Se
 *    publica en `@services/extensions/dynamicSyntax` por path.
 * 2. **Extractor por expresiones regulares** (`@services/symbolExtractor`): la
 *    red de seguridad para los 20 lenguajes que el motor tiene compilados (y
 *    para los que no tienen extensión instalada). Aproxima, pero no miente:
 *    sólo reconoce las formas que su tabla conoce.
 *
 * Click en un símbolo = mover el cursor de ESE editor (no “abrir el archivo”):
 * el outline es del archivo que ya está abierto, así que saltar a su línea es
 * lo único que tiene sentido.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { getFileSessionText } from '@features/editor/fileSession'
import { extractSymbols, SymbolIcons, type DocumentSymbol } from '@services/symbolExtractor'
import {
  getDynamicSyntax,
  subscribeToDynamicSyntax
} from '@services/extensions/dynamicSyntax'
import { revealInnertaPosition } from '@features/editor/engines/innerta/hostBridge'
import type { ToolDockPanelProps } from '../../types'
import styles from './OutlinePanel.module.css'

async function readContent(path: string): Promise<string | null> {
  const live = getFileSessionText(path)
  if (typeof live === 'string') return live
  try {
    const res = await window.api.fs.readFile(path)
    return res.success ? (res.content ?? null) : null
  } catch {
    return null
  }
}

export default function OutlinePanel({ currentFile }: ToolDockPanelProps): JSX.Element {
  const [symbols, setSymbols] = useState<DocumentSymbol[]>([])
  /** `true` = los símbolos vienen del árbol (fuente buena), no del regex. */
  const [fromTree, setFromTree] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    if (!currentFile) {
      setSymbols([])
      setExpanded(new Set())
      setFromTree(false)
      return
    }

    /** Expande los símbolos de primer nivel con hijos (como VS Code). */
    const openRoots = (next: DocumentSymbol[]): Set<string> => {
      const open = new Set<string>()
      next.forEach((symbol, index) => {
        if (symbol.children && symbol.children.length > 0) open.add(String(index))
      })
      return open
    }

    const apply = (): void => {
      if (cancelled) return
      // 1. El árbol, si su extensión ya publicó los símbolos del archivo.
      const dynamic = getDynamicSyntax(currentFile.path)
      if (dynamic && dynamic.symbols.length > 0) {
        setSymbols(dynamic.symbols)
        setExpanded(openRoots(dynamic.symbols))
        setFromTree(true)
        return
      }
      // 2. Fallback: el extractor por regex sobre el texto del archivo.
      setFromTree(false)
      void readContent(currentFile.path).then((content) => {
        if (cancelled || content === null) return
        const next = extractSymbols(content, currentFile.name)
        setSymbols(next)
        setExpanded(openRoots(next))
      })
    }

    apply()
    // Los símbolos del árbol llegan DESPUÉS de abrir el archivo (tokenizar es
    // asíncrono): sin esta suscripción el panel se quedaba con lo del regex.
    const unsubscribe = subscribeToDynamicSyntax(apply)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentFile])

  const toggle = useCallback((key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const goto = useCallback(
    (symbol: DocumentSymbol): void => {
      if (!currentFile) return
      // El outline es del archivo activo: se mueve SU cursor. Si ese editor no
      // está vivo (la tab se cerró y el panel no se enteró todavía), no se
      // hace nada: abrir otro archivo “para ir al símbolo” sería mentir.
      revealInnertaPosition(currentFile.path, symbol.line, 0)
    },
    [currentFile]
  )

  const renderSymbol = useMemo(
    () =>
      (symbol: DocumentSymbol, key: string, level: number): JSX.Element => {
        const hasChildren = (symbol.children?.length ?? 0) > 0
        const isExpanded = expanded.has(key)
        const info = SymbolIcons[symbol.kind] ?? { icon: '•', color: '#cccccc' }
        return (
          <div key={key}>
            <button
              type="button"
              className={styles.item}
              style={{ paddingLeft: 8 + level * 16 }}
              title={`${symbol.name} — línea ${symbol.line + 1}`}
              onClick={() => {
                if (hasChildren) toggle(key)
                goto(symbol)
              }}
            >
              <span className={styles.arrow}>
                {hasChildren ? (
                  <ProductIcon id={isExpanded ? 'chevron-down' : 'chevron-right'} size={12} />
                ) : null}
              </span>
              <span className={styles.glyph} style={{ color: info.color }}>
                {info.icon}
              </span>
              <span className={styles.name}>{symbol.name}</span>
              <span className={styles.line}>:{symbol.line + 1}</span>
            </button>
            {hasChildren && isExpanded ? (
              <div>
                {symbol.children!.map((child, index) =>
                  renderSymbol(child, `${key}-${index}`, level + 1)
                )}
              </div>
            ) : null}
          </div>
        )
      },
    [expanded, goto, toggle]
  )

  if (!currentFile) {
    return <div className={styles.empty}>Abre un archivo para ver su esquema</div>
  }
  if (symbols.length === 0) {
    return <div className={styles.empty}>No hay símbolos en este archivo</div>
  }
  return (
    <div className={styles.list}>
      {symbols.map((symbol, index) => renderSymbol(symbol, String(index), 0))}
      <div className={styles.source} title="Los símbolos del árbol los aporta la extensión del lenguaje">
        {fromTree ? 'Árbol de sintaxis (tags.scm)' : 'Extractor local'}
      </div>
    </div>
  )
}

/**
 * Panel "Inspeccionar tokens" — de dónde salió el color de cada token.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ RESPONDE
 *
 * "¿Por qué este archivo se ve así?" Es la única herramienta que separa las
 * capas que deciden el color de un carácter:
 *
 *   1. la gramática embebida del motor (no aparece acá: no pasa por el host),
 *   2. el paquete de lenguaje instalado (gramática TextMate o tree-sitter
 *      dinámico del `.sef`),
 *   3. el language server (semantic tokens),
 *   4. el tema activo, que decide QUÉ color tiene cada slot.
 *
 * Y muestra lo que de verdad llega al canvas: slot, scope stack y el color que
 * el tema le asignó a ese slot. Un scope que está bien y un color que está mal
 * son diagnósticos distintos, y con esto se distinguen de un vistazo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ MUESTRA **TODAS** LAS FUENTES, NO LA QUE GANA
 *
 * Ver sólo la ganadora esconde el caso interesante: el LSP cubre la mitad del
 * archivo y la gramática la otra mitad, y el hueco de uno se ve en el otro. Por
 * eso cada fuente tiene su bloque, en orden de prioridad, con el badge de cuál
 * está pisando.
 */

import { useEffect, useState, type JSX } from 'react'
import { getEditorFiles, subscribeToEditorFiles } from '@features/editor/editorBus'
import {
  getHighlightSnapshots,
  groupSnapshotTokens,
  slotLabel,
  subscribeToHighlightSnapshots,
  type HighlightSnapshot,
  type InspectableSource
} from '../engines/innerta/highlightSnapshot'
import { currentThemeSlotColors } from '../engines/innerta/themeTokenRules'
import { rgbaToCss } from '../engines/innerta/innertaTheme'
import styles from './TokenInspector.module.css'

/** Cuántos tokens crudos se listan (un archivo grande tiene decenas de miles). */
const MAX_ROWS = 300

const SOURCE_LABELS: Record<InspectableSource, string> = {
  textMate: 'Gramática de extensión (TextMate)',
  semanticTokens: 'Language server (semantic tokens)',
  treeSitterDynamic: 'Tree-sitter dinámico del paquete'
}

function sourceLabel(source: InspectableSource): string {
  return SOURCE_LABELS[source] ?? source
}

/** `hace 2 s` — para saber si el snapshot es del texto que se está mirando. */
function ageLabel(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 1) return 'ahora'
  if (seconds < 60) return `hace ${seconds} s`
  return `hace ${Math.round(seconds / 60)} min`
}

/** Un color del tema, o el aviso de que ese slot lo pinta el motor. */
function SlotColor({ slot, colors }: { slot: number; colors: Map<number, number> }): JSX.Element {
  const color = colors.get(slot)
  if (color === undefined) {
    return (
      <span className={styles.muted} title="El motor pinta este campo con su valor por defecto">
        {slotLabel(slot)} · por defecto
      </span>
    )
  }
  return (
    <span>
      <span className={styles.swatch} style={{ background: rgbaToCss(color) }} aria-hidden="true" />
      {slotLabel(slot)}
    </span>
  )
}

function SourceBlock({
  snapshot,
  winning,
  colors
}: {
  snapshot: HighlightSnapshot
  winning: boolean
  colors: Map<number, number>
}): JSX.Element {
  const groups = groupSnapshotTokens(snapshot.tokens)
  const listed = snapshot.tokens.slice(0, MAX_ROWS)

  return (
    <section
      className={[styles.source, winning ? styles.sourceWinning : null].filter(Boolean).join(' ')}
    >
      <header className={styles.sourceHeader}>
        <span className={styles.sourceTitle}>{sourceLabel(snapshot.source)}</span>
        {winning ? <span className={[styles.badge, styles.badgeWinning].join(' ')}>pisa al resto</span> : null}
        <span className={styles.badge}>prioridad {snapshot.source === 'semanticTokens' ? 2 : 1}</span>
        <span className={styles.badge}>{snapshot.tokens.length} tokens</span>
        <span className={styles.badge}>{groups.length} scopes</span>
      </header>

      <div className={styles.sourceMeta}>
        {[
          snapshot.languageId ? `lenguaje: ${snapshot.languageId}` : null,
          snapshot.scopeName ? `scope raíz: ${snapshot.scopeName}` : null,
          snapshot.extensionId ? `paquete: ${snapshot.extensionId}` : null,
          ageLabel(snapshot.at)
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>

      {/* Resumen por scope stack: es la vista útil (un archivo grande tiene
          decenas de miles de tokens pero decenas de scopes distintos). */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>slot / color del tema</th>
              <th>scope o tipo</th>
              <th className={styles.num}>tokens</th>
              <th>ejemplo</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.detail}>
                <td>
                  <SlotColor slot={group.slot} colors={colors} />
                </td>
                <td className={styles.scope}>{group.detail}</td>
                <td className={styles.num}>{group.count}</td>
                <td>
                  L{group.sample.line + 1}:{group.sample.startChar}–{group.sample.startChar + group.sample.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.note}>
        {snapshot.tokens.length > MAX_ROWS
          ? `Tokens crudos: se listan los primeros ${MAX_ROWS} de ${snapshot.tokens.length}.`
          : 'Tokens crudos:'}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>línea:col</th>
              <th>largo</th>
              <th>slot</th>
              <th>scope stack</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((token, index) => (
              <tr key={`${token.line}:${token.startChar}:${index}`}>
                <td>
                  L{token.line + 1}:{token.startChar}
                </td>
                <td className={styles.num}>{token.length}</td>
                <td>{slotLabel(token.slot)}</td>
                <td className={styles.scope}>{token.detail.join(' ') || '(sin scope)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function TokenInspector(): JSX.Element {
  const [path, setPath] = useState<string | null>(() => getEditorFiles().activePath)
  const [snapshots, setSnapshots] = useState<HighlightSnapshot[]>(() =>
    getHighlightSnapshots(getEditorFiles().activePath)
  )
  const [colors, setColors] = useState<Map<number, number>>(() => currentThemeSlotColors())

  useEffect(() => {
    const sync = (): void => {
      const next = getEditorFiles().activePath
      setPath(next)
      setSnapshots(getHighlightSnapshots(next))
    }
    const unsubFiles = subscribeToEditorFiles(sync)
    const unsubSnapshots = subscribeToHighlightSnapshots(sync)
    // El tema decide el color de cada slot: si cambia, la tabla tiene que
    // mostrar el color nuevo (si no, el panel mentiría sobre el canvas).
    const onTheme = (): void => setColors(currentThemeSlotColors())
    window.addEventListener('theme-changed', onTheme)
    window.addEventListener('highlight-source-changed', onTheme)
    return () => {
      unsubFiles()
      unsubSnapshots()
      window.removeEventListener('theme-changed', onTheme)
      window.removeEventListener('highlight-source-changed', onTheme)
    }
  }, [])

  const copy = (): void => {
    const payload = { path, generatedAt: new Date().toISOString(), sources: snapshots }
    void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2))
  }

  if (!path) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <span>No hay archivo activo.</span>
          <span>Abrí un archivo del proyecto y volvé a abrir este panel.</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.fileHeader}>
        <span className={styles.fileName}>{path.split(/[\\/]/).pop()}</span>
        <span className={styles.filePath}>{path}</span>
      </div>

      {snapshots.length === 0 ? (
        <div className={styles.empty}>
          <span>Todavía no hay tokens del host para este archivo.</span>
          <span>
            Pasa si el lenguaje no tiene gramática de extensión ni semantic tokens (el motor pinta
            con sus gramáticas embebidas), o si el archivo se acaba de abrir: esperá un instante y el
            panel se actualiza solo.
          </span>
        </div>
      ) : (
        snapshots.map((snapshot, index) => (
          <SourceBlock
            key={snapshot.source}
            snapshot={snapshot}
            winning={index === 0 && snapshots.length > 1}
            colors={colors}
          />
        ))
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={copy} disabled={snapshots.length === 0}>
          Copiar diagnóstico (JSON)
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            setSnapshots(getHighlightSnapshots(getEditorFiles().activePath))
            setColors(currentThemeSlotColors())
          }}
        >
          Actualizar
        </button>
      </div>
    </div>
  )
}

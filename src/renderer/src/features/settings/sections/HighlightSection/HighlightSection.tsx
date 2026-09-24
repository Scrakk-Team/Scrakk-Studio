// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección Resaltado — quién pinta los tokens del editor.
 *
 * Son DOS decisiones independientes, y por eso hay dos grupos:
 *
 * 1. **Fuente** (`editor.highlightSource`): qué gana en el overlay.
 *      - treesitter: gramáticas locales (default, sin server).
 *      - lsp: SOLO semantic tokens del language server.
 *      - mixed: base local + overlay de semantic tokens donde cubre.
 * 2. **Motor de gramática** (`editor.grammarEngine`): qué motor produce la capa
 *    de gramática cuando un lenguaje trae las DOS cosas (un `.tmLanguage` que
 *    vino de VS Code y un parser tree-sitter con sus `.scm`). Sin esta opción
 *    el desempate era invisible: TextMate ganaba siempre y el parser del
 *    paquete quedaba cargado, con su proceso aparte, para nada.
 *
 * Las dos preferencias viven en el storage system y las consumen los puentes
 * de Innerta (`languageHighlightBridge` / `treeSitterHighlightBridge`).
 */

import { useState, type JSX } from 'react'
import {
  getPersistedGrammarEngine,
  getPersistedHighlightSource,
  persistGrammarEngine,
  persistHighlightSource,
  type EditorGrammarEngine,
  type EditorHighlightSource
} from '@services/storage'
import { openTokenInspector } from '@features/editor/inspect'
import styles from './HighlightSection.module.css'

const SOURCE_OPTIONS: Array<{ id: EditorHighlightSource; label: string; desc: string }> = [
  {
    id: 'treesitter',
    label: 'Tree-sitter',
    desc: 'Gramáticas locales. Rápido, sin servidor.'
  },
  {
    id: 'lsp',
    label: 'LSP (semantic tokens)',
    desc: 'Solo tokens del language server. Máxima precisión.'
  },
  {
    id: 'mixed',
    label: 'Mixto',
    desc: 'Base Tree-sitter + overlay LSP donde cubre.'
  }
]

const ENGINE_OPTIONS: Array<{ id: EditorGrammarEngine; label: string; desc: string }> = [
  {
    id: 'auto',
    label: 'Automático',
    desc: 'TextMate si el paquete lo trae; si no, el parser tree-sitter.'
  },
  {
    id: 'treeSitter',
    label: 'Tree-sitter del paquete',
    desc: 'Siempre el árbol de sintaxis si hay uno usable. Más preciso, usa un proceso aparte.'
  },
  {
    id: 'textMate',
    label: 'TextMate',
    desc: 'Solo gramáticas .tmLanguage. No levanta el proceso de tree-sitter.'
  }
]

export function HighlightSection(): JSX.Element {
  const [source, setSource] = useState<EditorHighlightSource>(() =>
    getPersistedHighlightSource()
  )
  const [engine, setEngine] = useState<EditorGrammarEngine>(() => getPersistedGrammarEngine())

  const handleSelectSource = (next: EditorHighlightSource): void => {
    setSource(next)
    persistHighlightSource(next)
    // El puente de Innerta escucha este evento (innertaTheme ya lo hace).
    window.dispatchEvent(new CustomEvent('highlight-source-changed', { detail: { source: next } }))
  }

  const handleSelectEngine = (next: EditorGrammarEngine): void => {
    setEngine(next)
    persistGrammarEngine(next)
    // Los dos puentes de gramática escuchan `highlight-engine-changed`: tienen
    // que recalcular el archivo abierto ya (si no, el cambio recién se vería al
    // reabrir el archivo).
    window.dispatchEvent(new CustomEvent('highlight-engine-changed', { detail: { engine: next } }))
  }

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        La opción aplica al editor Innerta con un archivo que tenga server LSP
        activo. Sin server, siempre pinta Tree-sitter.
      </p>
      <div className={styles.grid}>
        {SOURCE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={[styles.card, source === option.id ? styles.cardActive : null]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleSelectSource(option.id)}
          >
            <span className={styles.cardLabel}>{option.label}</span>
            <span className={styles.cardDesc}>{option.desc}</span>
          </button>
        ))}
      </div>

      <span className={styles.groupLabel}>Motor de gramática</span>
      <p className={styles.hint}>
        Un paquete puede traer gramática TextMate y parser tree-sitter para el
        mismo lenguaje. Aquí se decide cuál manda (los dos a la vez pintarían dos
        veces el mismo rango).
      </p>
      <div className={styles.grid}>
        {ENGINE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={[styles.card, engine === option.id ? styles.cardActive : null]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleSelectEngine(option.id)}
          >
            <span className={styles.cardLabel}>{option.label}</span>
            <span className={styles.cardDesc}>{option.desc}</span>
          </button>
        ))}
      </div>

      {/* Diagnóstico: qué fuente pintó cada token del archivo activo, con el
          scope y el color del tema. Es la forma de saber si el culpable es la
          gramática, el server o el tema. */}
      <button type="button" className={styles.diagnose} onClick={openTokenInspector}>
        Inspeccionar tokens del archivo activo
      </button>
    </div>
  )
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { memo, useState, type JSX, type ReactNode } from 'react'
import { Highlight, Prism, themes } from 'prism-react-renderer'
import { useTheme } from '@core/theme/ThemeProvider'
import styles from './CodeBlock.module.css'

interface CodeBlockProps {
  /** className del <code> de react-markdown: "language-tsx". */
  className?: string
  children?: ReactNode
  /** Nodo hast — usado solo para leer data.meta (nombre de archivo). */
  node?: { data?: { meta?: string } } | undefined
}

/**
 * Bloque de código — réplica del de Scrakk:
 * wrapper con borde redondeado, header de 28px con lang en mayúsculas +
 * botón copiar de 32px, y resaltado con Prism (vsDark/vsLight según tema).
 * Soporta bloques `diff` con líneas + / - coloreadas.
 */
export const CodeBlock = memo(function CodeBlock({
  className,
  children,
  node
}: CodeBlockProps): JSX.Element {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(false)

  const contentString = String(children || '').replace(/\n$/, '')
  const match = /language-([\w-]+)/.exec(className || '')
  const language = match ? match[1] : 'plaintext'

  // Nombre de archivo: desde el meta del fence (```ts app.ts) o desde la
  // primera línea del código (// app.ts, # app.ts, /* app.ts */).
  let filename = ''
  const meta = node?.data?.meta
  if (meta) {
    const metaStr = String(meta).trim()
    if (metaStr && !metaStr.includes('=')) filename = metaStr
  }
  if (!filename && contentString) {
    const firstLine = contentString.split('\n')[0].trim()
    const nameMatch = firstLine.match(
      /^(?:\/\/|#|<!--|\/\*)\s*([a-zA-Z0-9_\-/\\]+\.[a-zA-Z0-9]+)/
    )
    if (nameMatch?.[1]) filename = nameMatch[1]
  }

  const displayLang =
    language && language !== 'plaintext' ? language.toUpperCase() : 'TEXT'

  const copy = (): void => {
    navigator.clipboard.writeText(contentString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isDiff = language === 'diff'
  const prismLang = Prism.languages[language] ? language : 'plaintext'
  const prismTheme = theme === 'light' ? themes.vsLight : themes.vsDark

  return (
    <div className={styles.cb}>
      <div className={styles.cbHead}>
        <span className={styles.cbLang} title={filename || undefined}>
          {displayLang}
        </span>
        <button
          type="button"
          className={styles.cbCopy}
          onClick={copy}
          title={copied ? 'Copiado' : 'Copiar código'}
          aria-label={copied ? 'Copiado' : 'Copiar código'}
        >
          {copied ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2.5" />
              <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
            </svg>
          )}
        </button>
      </div>
      <div className={styles.cbBody}>
        {isDiff ? (
          <pre className={styles.cbPre}>
            <code className={styles.cbDiff}>{renderDiff(contentString)}</code>
          </pre>
        ) : (
          <Highlight theme={prismTheme} code={contentString} language={prismLang}>
            {({ tokens, getLineProps, getTokenProps }) => (
              <pre className={styles.cbPre}>
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line, key: i })}>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token, key })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        )}
      </div>
    </div>
  )
})

/** Líneas de un bloque `diff`: + verde, - rojo, resto neutro. */
function renderDiff(content: string): JSX.Element {
  const lines = content.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        let cls = styles.diffLine
        let sign: ReactNode = <span className={styles.diffSign}>{'\u00A0'}</span>
        let text = line
        if (line === '+' || line.startsWith('+ ') || line.startsWith('+\t')) {
          cls += ' ' + styles.diffAdded
          sign = <span className={styles.diffSign}>+</span>
          text = line.substring(1)
        } else if (line === '-' || line.startsWith('- ') || line.startsWith('-\t')) {
          cls += ' ' + styles.diffRemoved
          sign = <span className={styles.diffSign}>-</span>
          text = line.substring(1)
        } else if (line.startsWith('  ')) {
          text = line.substring(1)
        }
        return (
          <span key={i} className={cls}>
            {sign}
            {text}
          </span>
        )
      })}
    </>
  )
}

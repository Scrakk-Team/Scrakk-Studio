import { memo, type JSX, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components, ExtraProps } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { CodeBlock } from '../CodeBlock/CodeBlock'
import styles from './Markdown.module.css'

/**
 * Código: detecta inline vs bloque (misma heurística que Scrakk).
 * Los bloques van a <CodeBlock> (que lee className "language-*" y el meta
 * del fence para el nombre de archivo); lo demás es código inline.
 */
function Code({
  className,
  children,
  node
}: JSX.IntrinsicElements['code'] & ExtraProps): JSX.Element {
  // El nodo hast se lee con un cast mínimo: solo nos importan el tag del
  // padre (inline?) y el meta del fence (nombre de archivo).
  const hast = node as
    | { parent?: { tagName?: string }; data?: { meta?: string } }
    | undefined

  let isInline = false
  // Un fence con language- es SIEMPRE bloque (aunque el contenido sea corto).
  if (className?.startsWith('language-')) {
    isInline = false
  } else if (hast?.parent?.tagName === 'p') {
    isInline = true
  } else if (
    typeof children === 'string' &&
    !children.includes('\n') &&
    children.length < 100
  ) {
    isInline = true
  } else if (!className) {
    const content = String(children || '')
    isInline = content.length < 50 && !content.includes('\n')
  }

  if (isInline) {
    return <code className={styles.inlineCode}>{children}</code>
  }
  return (
    <CodeBlock className={className} node={hast}>
      {children}
    </CodeBlock>
  )
}

/**
 * Párrafo custom: un div con margen 12px (evita que react-markdown meta
 * un <pre> dentro de un <p>, y da el espaciado tipo Scrakk).
 */
function Paragraph({ children }: { children?: ReactNode }): JSX.Element {
  return <div className={styles.p}>{children}</div>
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: Code,
  p: Paragraph,
  // Tabla real envuelta en un contenedor con scroll horizontal: si la tabla
  // entra, se ve idéntica (borde redondeado, bordes internos); si no, scrollea.
  table: ({ children }) => (
    <div className={styles.tblWrap}>
      <table className={styles.tbl}>{children}</table>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  )
}

interface MarkdownProps {
  content: string
}

/**
 * Renderizador de markdown — réplica del de Scrakk:
 * react-markdown + GFM (tablas, tachado, autolinks) + remark-breaks
 * (los saltos de línea simples se respetan) + rehype-raw sanitizado
 * (permite HTML crudo como <details>, limpiado por rehype-sanitize).
 * Las tablas son <table> reales, los codeblocks usan Prism.
 *
 * memo por `content` (string): con el historial largo, los mensajes viejos
 * no se re-parsean por cada token del stream (el parse + Prism es lo más
 * caro del chat). Esto además estabiliza las props de CodeBlock y su memo
 * sí evita re-resaltados.
 */
export const Markdown = memo(function Markdown({ content }: MarkdownProps): JSX.Element {
  return (
    <div className={styles.md}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

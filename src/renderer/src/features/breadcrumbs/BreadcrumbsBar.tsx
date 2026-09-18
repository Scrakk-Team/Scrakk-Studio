import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { FileTypeIcon } from '@features/explorer/components/FileTypeIcon'
import { openFileInEditor, subscribeToEditorFiles, getEditorFiles } from '@features/editor/editorBus'
import {
  showAnchoredModal,
  anchoredModalId,
  closeModal,
  type AnchoredRect
} from '@services/modals'
import { buildSegments, type CrumbSegment } from './segments'
import { ExplorerView } from '@features/explorer'
import styles from './BreadcrumbsBar.module.css'

const DROPDOWN_KEY = 'breadcrumbs-level'
const ROOT_KEY = 'scrakk-studio:root-path'

export interface BreadcrumbsBarProps {
  /** Raíz del contexto (default: workspace global). */
  root?: string | null
  /** Archivo activo (default: el del editor). */
  path?: string | null
  /** false = solo lectura (sin dropdowns). Default true. */
  interactive?: boolean
  /** Abrir archivo (default: openFileInEditor). */
  onNavigate?: (path: string, name: string) => void
  /** Iconos por segmento (default true, temables). */
  showIcons?: boolean
}

function useWorkspaceRoot(): string | null {
  const [root, setRoot] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ROOT_KEY)
    } catch {
      return null
    }
  })
  useEffect(() => {
    const onChange = (event: Event): void => {
      const next = (event as CustomEvent<{ path?: string }>).detail?.path
      if (next !== undefined) setRoot(next)
    }
    window.addEventListener('workspace-changed', onChange)
    return () => window.removeEventListener('workspace-changed', onChange)
  }, [])
  return root
}

function useActivePath(): string | null {
  const [active, setActive] = useState<string | null>(() => getEditorFiles().activePath)
  useEffect(() => subscribeToEditorFiles(() => setActive(getEditorFiles().activePath)), [])
  return active
}

/**
 * Barra de breadcrumbs (root > carpetas > archivo), spawneable con su
 * config. Cada segmento abre el dropdown anclado de su nivel, servido con
 * la API del explorer (fs + FileTypeIcon).
 */
export function BreadcrumbsBar({
  root: rootProp,
  path: pathProp,
  interactive = true,
  onNavigate,
  showIcons = true
}: BreadcrumbsBarProps): JSX.Element | null {
  const workspaceRoot = useWorkspaceRoot()
  const editorActive = useActivePath()
  const openDirRef = useRef<string | null>(null)

  const root = rootProp !== undefined ? rootProp : workspaceRoot
  const activePath = pathProp !== undefined ? pathProp : editorActive
  const segments: CrumbSegment[] = buildSegments(root, activePath)

  const openLevel = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, segment: CrumbSegment): void => {
      if (!interactive) return
      const button = event.currentTarget
      const rect = button.getBoundingClientRect()
      const anchor: AnchoredRect = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }
      const dir = segment.isFile
        ? segment.path.slice(0, Math.max(0, segment.path.replace(/\\/g, '/').lastIndexOf('/'))) || '/'
        : segment.path
      // Toggle si es el mismo nivel; si no, cambiar a él.
      const openId = anchoredModalId(DROPDOWN_KEY)
      if (openId && openDirRef.current === dir) {
        closeModal(openId)
        openDirRef.current = null
        return
      }
      if (openId) closeModal(openId)
      openDirRef.current = dir
      const navigate = onNavigate ?? openFileInEditor
      showAnchoredModal({
        key: DROPDOWN_KEY,
        title: segment.name,
        anchor,
        width: 300,
        placement: 'below',
        // Centrado sobre la carpeta clicada (no alineado a un borde).
        align: 'center',
        render: ({ close }) => (
          <div className={styles.treeWrap}>
            <ExplorerView
              root={dir}
              interactive={false}
              onOpenFile={(path, name) => {
                navigate(path, name)
                close()
              }}
            />
          </div>
        )
      })
    },
    [interactive, root, onNavigate]
  )

  if (segments.length === 0) return null

  return (
    <nav className={styles.bar} aria-label="Ruta del archivo">
      {segments.map((segment, index) => (
        <span key={`${segment.path}-${index}`} className={styles.crumb}>
          {index > 0 ? (
            <ProductIcon id="chevron-right" size={11} aria-hidden="true" />
          ) : null}
          <button
            type="button"
            className={[
              styles.segment,
              segment.isFile ? styles.segmentFile : null
            ]
              .filter(Boolean)
              .join(' ')}
            title={segment.path}
            disabled={!interactive}
            onClick={(event) => openLevel(event, segment)}
          >
            {showIcons ? (
              segment.isRoot ? (
                <ProductIcon id="folder-opened" size={13} />
              ) : segment.isFile ? (
                <FileTypeIcon
                  name={segment.name}
                  isDirectory={false}
                  isExpanded={false}
                  size={13}
                />
              ) : (
                <ProductIcon id="folder" size={13} />
              )
            ) : null}
            <span className={styles.label}>{segment.name}</span>
          </button>
        </span>
      ))}
    </nav>
  )
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from 'react'
import { ContextMenu, type ContextMenuItem } from '@ui'
import { isHistoryViewOpen, setSkillsViewOpen, subscribeToHistoryView, toggleHistoryView, useLayout } from '@features/layout'
import { getEditorFiles, performEditorEdit, requestCloseFile, type EditorEditAction } from '@features/editor'
import { openFilesViaDialog, openFolderViaDialog } from '@features/explorer'
import { SCRAKK_WEBSITE } from '@shared/links'
import { useTheme } from '@core/theme/ThemeProvider'
import styles from './MenuBar.module.css'

import { t, useLocale } from '@core/i18n'
type MenuId = 'file' | 'edit' | 'view' | 'help'

const MENU_IDS: MenuId[] = ['file', 'edit', 'view', 'help']

function runCommand(command: string): void {
  try {
    document.execCommand(command)
  } catch {
    // Comando no soportado por el entorno: no-op.
  }
}

/**
 * Fallback DOM de cada acción de Editar. Se usa cuando el foco NO es el editor
 * Innerta (chat, buscador, inputs): ahí `execCommand` sí opera sobre el campo.
 */
const DOM_COMMAND: Record<EditorEditAction, string> = {
  copy: 'copy',
  cut: 'cut',
  paste: 'paste',
  selectAll: 'selectAll',
  undo: 'undo',
  redo: 'redo'
}

/**
 * Barra de menús de la titlebar (Archivo / Editar / Ver / Ayuda).
 * Usa el sistema centralizado de ContextMenu para renderizar los dropdowns
 * vía portal y alineados a cada botón.
 */
export function MenuBar(): JSX.Element {
  const { theme, toggleTheme } = useTheme()
  const { slots, toggleSlotPanel, openPanelTab } = useLayout()

  // El historial ya no es un panel: es una vista dentro del chat. El menú
  // Ver necesita su estado para el check, así que se suscribe al store.
  const [historyOpen, setHistoryOpen] = useState(() => isHistoryViewOpen())
  useEffect(() => subscribeToHistoryView(() => setHistoryOpen(isHistoryViewOpen())), [])

  const [menuOpen, setMenuOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const hamRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setMenuOpen(false)
    setAnchor(null)
  }, [])

  // Abre el menú del hamburger, anclado abajo del botón.
  const openMenu = useCallback((): void => {
    const btn = hamRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setAnchor({ x: rect.left, y: rect.bottom + 2 })
    setMenuOpen(true)
  }, [])

  // ¿El foco, ANTES de abrir el menú, estaba en un campo de texto? El botón del
  // menú se lleva el foco al abrirse, así que hay que mirarlo en el
  // `pointerdown` (antes de que el navegador mueva el foco) para no robarle el
  // Copiar/Pegar al chat o al buscador.
  const focusWasEditable = useRef(false)
  const rememberFocus = useCallback((): void => {
    const el = document.activeElement as HTMLElement | null
    focusWasEditable.current =
      !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  }, [])

  // ── Acciones del menú Editar ────────────────────────────────────────────
  // Con el foco en un campo de texto el menú hace lo de siempre (DOM); si no,
  // se lo damos al editor Innerta activo. Antes SIEMPRE iba por
  // `document.execCommand`, que no toca el canvas del motor: por eso no hacía
  // nada con el editor.
  const editAction = useCallback((action: EditorEditAction): void => {
    if (!focusWasEditable.current && performEditorEdit(action)) return
    runCommand(DOM_COMMAND[action])
  }, [])

  // ── Acciones del menú Archivo ────────────────────────────────────────────
  // Salen de `@features/explorer` (mismas que la bienvenida): antes estaban
  // duplicadas acá y allá.
  const closeActiveFile = useCallback((): void => {
    const { activePath } = getEditorFiles()
    // Guardia dirty: ofrece Guardar/Cerrar sin guardar antes de tirar el buffer.
    if (activePath) requestCloseFile(activePath)
  }, [])

  const locale = useLocale()
  const menuDefinitions = useMemo<Record<MenuId, { label: string; items: ContextMenuItem[] }>>(() => {
    return {
      file: {
        label: t('menu.file'),
        items: [
          {
            label: t('menu.file.openFile'),
            shortcut: 'Ctrl+O',
            onClick: () => void openFilesViaDialog()
          },
          {
            label: t('menu.file.openFolder'),
            shortcut: 'Ctrl+Shift+O',
            onClick: () => void openFolderViaDialog()
          },
          {
            label: t('menu.file.closeFile'),
            shortcut: 'Ctrl+W',
            separatorBefore: true,
            onClick: closeActiveFile
          },
          {
            label: t('menu.file.closeWindow'),
            shortcut: 'Alt+F4',
            separatorBefore: true,
            onClick: () => window.api?.windowControls.close()
          }
        ]
      },
      edit: {
        label: t('menu.edit'),
        items: [
          {
            label: t('menu.edit.undo'),
            shortcut: 'Ctrl+Z',
            onClick: () => editAction('undo')
          },
          {
            label: t('menu.edit.redo'),
            shortcut: 'Ctrl+Y',
            onClick: () => editAction('redo')
          },
          {
            label: t('menu.edit.cut'),
            shortcut: 'Ctrl+X',
            separatorBefore: true,
            onClick: () => editAction('cut')
          },
          {
            label: t('menu.edit.copy'),
            shortcut: 'Ctrl+C',
            onClick: () => editAction('copy')
          },
          {
            label: t('menu.edit.paste'),
            shortcut: 'Ctrl+V',
            onClick: () => editAction('paste')
          },
          {
            label: t('menu.edit.selectAll'),
            shortcut: 'Ctrl+A',
            separatorBefore: true,
            onClick: () => editAction('selectAll')
          }
        ]
      },
      view: {
        label: t('menu.view'),
        items: [
          {
            label: theme === 'dark' ? t('menu.view.lightMode') : t('menu.view.darkMode'),
            onClick: toggleTheme
          },
          {
            label: t('menu.view.chatPanel'),
            checked: slots.right === 'chat',
            separatorBefore: true,
            onClick: () => toggleSlotPanel('right', 'chat')
          },
          {
            label: t('menu.view.chatHistory'),
            checked: historyOpen,
            onClick: () => {
              openPanelTab('right', 'chat')
              // Abrir historial cierra la vista de skills (comparten el panel).
              setSkillsViewOpen(false)
              toggleHistoryView()
            }
          },
          {
            label: t('menu.view.explorerPanel'),
            checked: slots.left === 'explorer',
            onClick: () => toggleSlotPanel('left', 'explorer')
          }
        ]
      },
      help: {
        label: t('menu.help'),
        items: [
          {
            label: t('menu.help.about'),
            // La web oficial, no un modal con info inventada/desactualizada.
            onClick: () => window.open(SCRAKK_WEBSITE, '_blank', 'noopener')
          }
        ]
      }
    }
  }, [
    locale,
    theme,
    toggleTheme,
    slots,
    toggleSlotPanel,
    openPanelTab,
    historyOpen,
    openFilesViaDialog,
    openFolderViaDialog,
    closeActiveFile,
    editAction
  ])

  // Menú del hamburger: cada opción de la titlebar es un SUBMENÚ con sus items
  // reales (los mismos dropdowns de antes), más Terminal.
  const hamburgerItems = useMemo<ContextMenuItem[]>(
    () => [
      ...MENU_IDS.map((id) => ({
        label: menuDefinitions[id].label,
        submenu: menuDefinitions[id].items
      })),
      {
        label: t('titlebar.terminal'),
        separatorBefore: true,
        onClick: () => toggleSlotPanel('bottom', 'innerta-terminal')
      }
    ],
    [menuDefinitions, toggleSlotPanel]
  )

  return (
    <div
      ref={rootRef}
      className={styles.menubar}
      role="menubar"
      aria-label={t('titlebar.menu.de.la.aplicacion')}
      onPointerDownCapture={rememberFocus}
    >
      <div className={styles.menu}>
        <button
          ref={hamRef}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t('titlebar.menu.de.la.aplicacion')}
          className={[styles.button, menuOpen ? styles.buttonOpen : null].filter(Boolean).join(' ')}
          onClick={() => (menuOpen ? close() : openMenu())}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      </div>

      {menuOpen && anchor ? (
        <ContextMenu
          items={hamburgerItems}
          x={anchor.x}
          y={anchor.y}
          onClose={close}
        />
      ) : null}
    </div>
  )
}
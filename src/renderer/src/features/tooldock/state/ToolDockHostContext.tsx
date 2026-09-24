// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ToolDock — estado POR INSTANCIA de host.
 *
 * Cada panel que monta <ToolDock hostId="…" /> envuelve su propia copia del
 * estado (panel activo, tamaño del panel flotante, animación de cierre).
 * A diferencia del ToolDock viejo (singleton global con UN activePanel para
 * toda la app), dos hosts abiertos son completamente independientes.
 *
 * El archivo activo se lee del bus del editor (features/editor) — un solo
 * consumidor aquí, no listeners sueltos por panel.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import { getEditorFiles, subscribeToEditorFiles } from '@features/editor'
import { lsGet, lsSet } from '@services/storage'
import type { ToolDockHostInfo } from '../types'

interface ToolDockHostState {
  hostId: string
  /** Info de contexto para items/filtros (se recalcula con el archivo activo). */
  hostInfo: ToolDockHostInfo
  /** Panel abierto del dock (id de ToolDockItem) o null. */
  activePanelId: string | null
  openPanel: (panelId: string) => void
  togglePanel: (panelId: string) => void
  closePanel: () => void
  /** Altura del panel flotante (persistida por hostId). */
  panelHeight: number
  setPanelHeight: (height: number) => void
  /** true durante la animación de salida del panel. */
  closing: boolean
}

const ToolDockHostContext = createContext<ToolDockHostState | null>(null)

const HEIGHT_MIN = 120

function heightKey(hostId: string): string {
  return `scrakk-studio:tooldock:${hostId}:height`
}

function loadHeight(hostId: string): number {
  try {
    const saved = lsGet<number>(heightKey(hostId))
    if (typeof saved === 'number' && saved >= HEIGHT_MIN) return saved
  } catch {
    // Sin storage: default.
  }
  return 280
}

export function ToolDockHostProvider({
  hostId,
  children
}: {
  hostId: string
  children: ReactNode
}): JSX.Element {
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [panelHeight, setPanelHeightState] = useState<number>(() => loadHeight(hostId))

  // Archivo activo del editor: una sola suscripción por host, re-render solo
  // cuando cambia el path activo.
  const lastPathRef = useRef<string | null>(getEditorFiles().activePath)
  const [currentFile, setCurrentFile] = useState<ToolDockHostInfo['currentFile']>(() => {
    const { openFiles, activePath } = getEditorFiles()
    const tab = activePath ? openFiles.find((file) => file.path === activePath) : null
    return tab ? { path: tab.path, name: tab.name } : null
  })

  useEffect(() => {
    return subscribeToEditorFiles((state) => {
      if (state.activePath === lastPathRef.current) return
      lastPathRef.current = state.activePath
      const tab = state.activePath
        ? state.openFiles.find((file) => file.path === state.activePath)
        : null
      setCurrentFile(tab ? { path: tab.path, name: tab.name } : null)
    })
  }, [])

  const setPanelHeight = useCallback(
    (height: number) => {
      const clamped = Math.max(HEIGHT_MIN, height)
      setPanelHeightState(clamped)
      try {
        lsSet(heightKey(hostId), clamped)
      } catch {
        // Sin storage: queda en memoria.
      }
    },
    [hostId]
  )

  const openPanel = useCallback((panelId: string) => {
    setClosing(false)
    setActivePanelId(panelId)
  }, [])

  const closePanel = useCallback(() => {
    setClosing(true)
    // Duración de la animación de salida (ver DockPanel.module.css).
    window.setTimeout(() => {
      setActivePanelId(null)
      setClosing(false)
    }, 150)
  }, [])

  const togglePanel = useCallback(
    (panelId: string) => {
      if (activePanelId === panelId) closePanel()
      else openPanel(panelId)
    },
    [activePanelId, closePanel, openPanel]
  )

  const value = useMemo<ToolDockHostState>(
    () => ({
      hostId,
      hostInfo: { hostId, currentFile },
      activePanelId,
      openPanel,
      togglePanel,
      closePanel,
      panelHeight,
      setPanelHeight,
      closing
    }),
    [hostId, currentFile, activePanelId, openPanel, togglePanel, closePanel, panelHeight, setPanelHeight, closing]
  )

  return <ToolDockHostContext.Provider value={value}>{children}</ToolDockHostContext.Provider>
}

export function useToolDockHost(): ToolDockHostState {
  const ctx = useContext(ToolDockHostContext)
  if (!ctx) throw new Error('useToolDockHost fuera de <ToolDockHostProvider>')
  return ctx
}

/** Contexto nullable para items que quieren saber su host (opcional). */
export function useToolDockHostInfo(): ToolDockHostInfo | null {
  const ctx = useContext(ToolDockHostContext)
  return ctx ? ctx.hostInfo : null
}

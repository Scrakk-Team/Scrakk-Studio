// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, useState, type JSX } from 'react'
import { getOrCreateInnertaEngine, getStoredEngine, type EditorEngine, type EditorEngineId } from './engine'
import { getEditorFiles, subscribeToEditorFiles } from './editorBus'
import { lspNotifyFileChanged } from '@services/lsp'
import { readEncoded, setDetected } from '@services/encodings'
import styles from './EditorPanel.module.css'

/**
 * Panel del editor — contenido del área central (bajo el container de tabs).
 *
 * Agnóstico del motor: monta InnertaEngine (ITE · WASM) en su host. Consume
 * el store de file-tabs: cuando cambia activePath, lee el archivo y lo carga
 * en Innerta (loadFile). Sin archivo activo no pinta contenido.
 */
export function EditorPanel(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<EditorEngine | null>(null)
  const [engineId] = useState<EditorEngineId>(() => getStoredEngine())

  // Monta el motor en el host.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const engine = getOrCreateInnertaEngine()
    engineRef.current = engine
    engine.attach(host)
    // No forzamos engine.focus() aquí: robaría el foco a inputs abiertos
    // en otras partes de la app. El canvas recibe foco cuando el usuario
    // interactúa con el editor (click → onPointerDown) o al cargar un
    // archivo (loadFile → canvas.focus).

    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  // activePath del store → leer contenido → cargar en Innerta.
  useEffect(() => {
    let loadingPath: string | null = null
    const load = async (activePath: string | null): Promise<void> => {
      const engine = engineRef.current
      if (!engine || !activePath || activePath === loadingPath) return
      loadingPath = activePath
      try {
        // Lectura con detección de encoding (BOM/UTF-16/Latin-1 → texto).
        const res = await readEncoded(activePath)
        if (!res.success || typeof res.text !== 'string' || !res.detected) return
        setDetected(activePath, res.text, res.detected)
        engine.loadFile(activePath, res.text)
        void lspNotifyFileChanged(activePath, res.text)
      } catch {
        // Lectura fallida: Innerta queda con su buffer actual.
      } finally {
        loadingPath = null
      }
    }
    // Carga inmediata al montar (remount sin emit, p. ej. al volver de
    // Bienvenida): garantiza que el engine arranque con el archivo activo.
    void load(getEditorFiles().activePath)
    return subscribeToEditorFiles(({ activePath }) => {
      void load(activePath)
    })
  }, [])

  return (
    <div className={styles.panel} data-engine={engineId}>
      <div ref={hostRef} className={styles.host} />
    </div>
  )
}
import { useEffect, useRef, useState, type JSX } from 'react'
import { createEditorEngine, getStoredEngine, type EditorEngine, type EditorEngineId } from './engine'
import { getEditorFiles, subscribeToEditorFiles } from './editorBus'
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

    const engine = createEditorEngine()
    engineRef.current = engine
    engine.attach(host)
    engine.focus()

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
        const res = await window.api.fs.readFile(activePath)
        if (!res.success || typeof res.content !== 'string') return
        engine.loadFile(activePath, res.content)
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
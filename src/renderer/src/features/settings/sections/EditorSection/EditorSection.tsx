// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Editor" — opciones del editor Innerta (WASM).
 *
 * Los valores viven en sus APIs correspondientes (nada hardcodeado aquí):
 * - Minimapa: getMinimapVisible / setMinimapVisibleEverywhere (InnertaEngine),
 *   que persiste en localStorage y aplica en vivo a todos los engines vivos.
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { ToggleSwitch } from '@ui'
import {
  getMinimapVisible,
  setMinimapVisibleEverywhere,
  MINIMAP_SETTING_KEY
} from '@features/editor/engines/innerta/InnertaEngine'
import styles from './EditorSection.module.css'

/** Evento de broadcast del toggle (mismo canal que el engine). */
const MINIMAP_EVENT = 'innerta-minimap-changed'

export function EditorSection(): JSX.Element {
  const [minimap, setMinimap] = useState<boolean>(() => getMinimapVisible())

  useEffect(() => {
    const sync = (): void => setMinimap(getMinimapVisible())
    window.addEventListener(MINIMAP_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(MINIMAP_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const handleMinimap = useCallback((next: boolean) => {
    setMinimap(next)
    setMinimapVisibleEverywhere(next)
  }, [])

  return (
    <div className={styles.section}>
      <div className={styles.headerText}>
        <h3>Editor</h3>
        <p>
          Opciones del editor de código (Innerta). Los cambios aplican al
          instante en todos los archivos abiertos.
        </p>
      </div>

      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowName}>Minimapa</span>
          <span className={styles.rowMeta}>
            Vista previa del archivo a la derecha del editor, con desplazamiento
            continuo y clic para navegar.
          </span>
        </div>
        <ToggleSwitch
          checked={minimap}
          label={minimap ? 'Desactivar minimapa' : 'Activar minimapa'}
          onChange={handleMinimap}
        />
      </div>
    </div>
  )
}

// Re-export para que el key de settings y el engine no diverjan.
export { MINIMAP_SETTING_KEY as EDITOR_MINIMAP_SETTING_KEY }

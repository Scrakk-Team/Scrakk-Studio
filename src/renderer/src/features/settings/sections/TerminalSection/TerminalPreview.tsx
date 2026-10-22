// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Previa REAL de la terminal dentro de Ajustes.
 *
 * No es un mock: monta una sesión viva de Innerta en modo terminal (el mismo
 * `TerminalSession` que usan las tabs), así se ve la fuente elegida —y los
 * reemplazos, el tema y el prompt— con el motor de verdad. El PTY se crea al
 * montar la sección y se destruye al salir; `reloadFont()` (que dispara
 * `setTerminalFontFamilyEverywhere`) la re-tipografía en caliente.
 *
 * El `epoch` la reinicia cuando se elige otra shell (el PTY no cambia de shell
 * en caliente), sin reiniciar por cada tecla de una ruta personalizada.
 */

import { useEffect, useState, type JSX } from 'react'
import { destroyTerminalSession, getTerminalSession } from '@services/innerta/terminalSession'
import { LiveSessionHost, type LiveSession } from '@features/sessions'
import styles from './TerminalSection.module.css'

const SESSION_ID = 'settings-terminal-preview'

interface TerminalPreviewProps {
  /** Cambia para recrear la sesión (p. ej. al elegir otra shell). */
  epoch: number
}

export function TerminalPreview({ epoch }: TerminalPreviewProps): JSX.Element {
  const [session, setSession] = useState<LiveSession | null>(null)

  useEffect(() => {
    // Sin autoFocus: la previa comparte modal con la navegación y los
    // controles; no debe robarles el foco al montarse.
    setSession(getTerminalSession(SESSION_ID, { autoFocus: false }))
    return () => {
      destroyTerminalSession(SESSION_ID)
    }
  }, [epoch])

  return (
    <div className={styles.terminal}>
      <div className={styles.termBar}>
        <span className={styles.light} />
        <span className={styles.light} />
        <span className={styles.light} />
        <span className={styles.termTitle}>innerta</span>
      </div>
      <div className={styles.termBody}>
        {session ? <LiveSessionHost key={epoch} session={session} /> : null}
      </div>
    </div>
  )
}

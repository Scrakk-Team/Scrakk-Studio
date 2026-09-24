// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Diálogo de exportar chat — contenido del modal global (showModal).
 *
 * Opciones como DATOS (no botones hardcodeados): .txt / .md / copiar.
 * ToggleSwitch global para incluir herramientas; el copiar respeta lo
 * configurado. Tras descargar/copiar se cierra solo.
 */

import { useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { ToggleSwitch } from '@ui'
import type { ChatSession } from '@features/chat'
import {
  buildChatExport,
  copyChatToClipboard,
  downloadTextFile,
  exportFileName
} from './exportChat'
import styles from './ExportChatDialog.module.css'

type ExportAction = 'txt' | 'md' | 'copy'

interface ExportOption {
  id: ExportAction
  label: string
  hint: string
  icon: string
}

const EXPORT_OPTIONS: ExportOption[] = [
  { id: 'txt', label: 'Exportar como .txt', hint: '.txt', icon: 'file-text' },
  { id: 'md', label: 'Exportar como .md', hint: '.md', icon: 'file-text' },
  { id: 'copy', label: 'Copiar al portapapeles', hint: 'clipboard', icon: 'copy' }
]

export function ExportChatDialog({
  session,
  onDone
}: {
  session: ChatSession
  onDone: () => void
}): JSX.Element {
  const [includeTools, setIncludeTools] = useState(true)
  const [copied, setCopied] = useState(false)

  const runOption = async (option: ExportAction): Promise<void> => {
    const text = buildChatExport(session, { includeTools })
    if (option === 'copy') {
      await copyChatToClipboard(text)
      setCopied(true)
      setTimeout(onDone, 900)
      return
    }
    downloadTextFile(exportFileName(session.title, option), text)
    onDone()
  }

  return (
    <div className={styles.dialog}>
      <label className={styles.toggleRow}>
        <ToggleSwitch
          checked={includeTools}
          label="Incluir herramientas en la exportación"
          onChange={setIncludeTools}
        />
        <span className={styles.toggleLabel}>Incluir herramientas</span>
      </label>

      <div className={styles.options} role="listbox" aria-label="Formato de exportación">
        {EXPORT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected="false"
            className={styles.option}
            onClick={() => void runOption(option.id)}
          >
            <ProductIcon id={option.icon} size={14} aria-hidden="true" />
            <span className={styles.optionLabel}>
              {option.id === 'copy' && copied ? '¡Copiado!' : option.label}
            </span>
            <span className={styles.optionHint}>{option.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ProblemsChip — conteo de problemas + acceso al panel de Problemas.
 *
 * Como en VS Code: en la barra de estado hay DOS números (errores y
 * advertencias) y el click abre/cierra la lista. Sin problemas el chip muestra
 * los dos ceros atenuados, que es una afirmación útil ("no hay nada") y no un
 * hueco.
 *
 * Los conteos salen del store de diagnósticos (LSP + extensiones), así que el
 * chip se actualiza con lo mismo que pinta el panel: no hay dos verdades.
 *
 * Los iconos NO llevan color propio: heredan el del chip, como el de git. El
 * rojo/ámbar viven en el panel de Problemas (donde hacen falta para distinguir
 * filas); en la barra serían tres acentos compitiendo en una franja de 22 px.
 */

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { countProblems, subscribeToDiagnostics, type ProblemCounts } from '@services/lsp'
import { getEditorFiles, subscribeToEditorFiles } from '@features/editor'
import { toggleSlotPanel } from '@features/layout'
import styles from './ProblemsChip.module.css'

import { t } from '@core/i18n'
export function ProblemsChip(): JSX.Element | null {
  const [counts, setCounts] = useState<ProblemCounts>(() => countProblems())
  // Sin archivos abiertos no hay nada que contar: el chip no se muestra (como
  // el resto de indicadores, que sólo tienen sentido con un editor).
  const [hasFiles, setHasFiles] = useState(() => getEditorFiles().openFiles.length > 0)

  useEffect(() => {
    const refresh = (): void => setCounts(countProblems())
    refresh()
    return subscribeToDiagnostics(refresh)
  }, [])

  useEffect(() => {
    const refresh = (): void => setHasFiles(getEditorFiles().openFiles.length > 0)
    refresh()
    return subscribeToEditorFiles(refresh)
  }, [])

  if (!hasFiles) return null

  const clean = counts.errors === 0 && counts.warnings === 0
  const title = clean
    ? t('statusbar.no.hay.errores.ni.advertencias')
    : `${counts.errors} error${counts.errors === 1 ? '' : 'es'} · ${counts.warnings} advertencia${
        counts.warnings === 1 ? '' : 's'
      }${counts.infos > 0 ? ` · ${counts.infos} de información` : ''}`

  return (
    <button
      type="button"
      className={[styles.chip, clean ? styles.clean : null].filter(Boolean).join(' ')}
      title={title}
      aria-label={t('statusbar.problemas')}
      onClick={() => toggleSlotPanel('bottom', 'problems')}
    >
      <ProductIcon id="close" size={12} />
      <span className={styles.count}>{counts.errors}</span>
      <ProductIcon id="alert" size={12} />
      <span className={styles.count}>{counts.warnings}</span>
    </button>
  )
}

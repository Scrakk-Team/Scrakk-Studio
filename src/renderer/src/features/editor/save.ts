// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Guardado del editor — mod+s.
 *
 * Flujo: buffer de Innerta (getText) → normaliza EOL del doc → codifica con
 * el encoding del doc (BOM incluido si corresponde) → escribe vía main.
 *
 * Consciente de revisión: la revisión se captura ANTES de leer el buffer y
 * se marca clean tras el write exitoso (si el usuario escribe durante el
 * write, la revisión queda por encima → el archivo sigue dirty).
 *
 * El comando vive en la paleta/shortcuts como `file.save`; cualquier parte
 * de la app puede invocar saveActiveFile() / saveFileByPath().
 */

import { getEditorFiles } from './editorBus'
import { getFileSession } from './fileSession'
import { writeEncoded, getDocumentEncoding, notifyEncodingListeners } from '@services/encodings'
import { notifyLspDocumentSaved } from '@services/lsp'
import { invalidateLspSymbolNames } from './definitionNavigation'

export interface SaveResult {
  ok: boolean
  path?: string
  error?: string
}

/** Guarda UN archivo con SU encoding/EOL registrados. */
export async function saveFileByPath(path: string): Promise<SaveResult> {
  const session = getFileSession(path)
  const revision = session.getRevision()
  const text = session.getText()
  if (typeof text !== 'string') return { ok: false, error: 'Buffer no disponible' }

  const doc = getDocumentEncoding(path)
  const result = await writeEncoded({
    path,
    text,
    encoding: doc?.encoding ?? 'utf8',
    preserveBom: doc?.hasBom ?? true,
    lineEnding: doc?.lineEnding
  })

  if (result.success) {
    // El estado en disco vuelve a coincidir con el doc: limpiar flags dirty.
    if (typeof revision === 'number') session.markClean(revision)
    notifyEncodingListeners(path)
    // `didSave`: hay servers que sólo validan al guardar, y sin este aviso sus
    // diagnósticos no aparecían hasta reabrir el archivo.
    void notifyLspDocumentSaved(path)
    // La tabla de símbolos del hover puede haber cambiado.
    invalidateLspSymbolNames(path)
    return { ok: true, path }
  }
  return { ok: false, error: result.error ?? 'Error al guardar' }
}

/** Guarda el archivo activo. Comando `file.save` (mod+s). */
export async function saveActiveFile(): Promise<SaveResult> {
  const { activePath } = getEditorFiles()
  if (!activePath) return { ok: false, error: 'Sin archivo activo' }
  return saveFileByPath(activePath)
}

/**
 * Guarda el archivo activo con OTRO encoding (acción "Guardar con encoding"
 * del chip). Cambia el docState para futuras aperturas también.
 */
export async function saveActiveFileWith(
  encoding: string,
  preserveBom: boolean,
  lineEnding?: 'LF' | 'CRLF'
): Promise<SaveResult> {
  const { activePath } = getEditorFiles()
  if (!activePath) return { ok: false, error: 'Sin archivo activo' }

  const session = getFileSession(activePath)
  const revision = session.getRevision()
  const text = session.getText()
  if (typeof text !== 'string') return { ok: false, error: 'Buffer no disponible' }

  const result = await writeEncoded({ path: activePath, text, encoding, preserveBom, lineEnding })
  if (!result.success) return { ok: false, error: result.error ?? 'Error al guardar' }

  if (typeof revision === 'number') session.markClean(revision)
  const { setEncoding } = await import('@services/encodings')
  setEncoding(activePath, encoding)
  void notifyLspDocumentSaved(activePath)
  invalidateLspSymbolNames(activePath)
  return { ok: true, path: activePath }
}

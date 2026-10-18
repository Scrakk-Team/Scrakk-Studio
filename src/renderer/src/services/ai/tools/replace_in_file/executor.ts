// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'
import { lspAfterEdit } from '../../../lsp'
import { api } from '@services/api'

/**
 * Regex que matchea `text` tolerando un CR final y espacios/tabs finales de
 * línea (el archivo real puede tener CRLF o trailing whitespace que el old_str
 * no trae).
 */
function tolerantMatch(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped.replace(/\n/g, '[ \\t]*\\r?\\n'), 'g')
}

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const path = args.path as string
    const oldStr = args.old_str as string
    const newStr = args.new_str as string
    const fullPath = resolvePath(path, ctx.projectRoot)

    // Read existing content
    const readResponse = await api.fs.readFile(fullPath)
    if (!readResponse.success || readResponse.content === undefined) {
      return {
        success: false,
        content: `ERROR: File not found: ${path}\n\nThe file does not exist. Please check the path and try again.`
      }
    }

    const content = readResponse.content

    // Match EXACTO sobre el original. El reemplazo usa una FUNCIÓN para que un
    // `$1`/`$&` en el new_str quede literal (con `String.replace` string se
    // interpretaría como patrón).
    let count = content.split(oldStr).length - 1
    let newContent: string | null = count === 1 ? content.replace(oldStr, () => newStr) : null

    // Fallback tolerante: el archivo puede tener CRLF o espacios finales que el
    // old_str no trae. Se busca tolerando eso, pero se reemplaza SOLO el tramo
    // matcheado — el resto del archivo queda intacto (antes se escribía TODO el
    // archivo normalizado, perdiendo trailing spaces y CRLF).
    if (count === 0) {
      const rx = tolerantMatch(oldStr)
      const hits = content.match(rx)?.length ?? 0
      count = hits
      if (hits === 1) newContent = content.replace(rx, () => newStr)
    }

    if (count === 0) {
      const preview = content.length > 2000 ? content.substring(0, 2000) + '\n\n... (truncated)' : content
      return {
        success: false,
        content: `ERROR: Text not found in file: ${path}\n\n=== SEARCHED FOR ===\n${oldStr}\n\n=== FILE CONTENT ===\n${preview}\n\nThe exact text was not found. Check for:\n- Extra/missing whitespace or indentation\n- Different line endings\n- Typos or slight differences`
      }
    }

    if (count > 1) {
      return {
        success: false,
        content: `ERROR: Text found ${count} times in ${path}\n\nThe text must be unique. Include more surrounding context to make the match unique.`
      }
    }

    const finalContent = newContent ?? content
    const writeResponse = await api.fs.writeFile(fullPath, finalContent)

    if (writeResponse.success) {
      window.dispatchEvent(new CustomEvent('refresh-explorer'))
      window.dispatchEvent(new CustomEvent('file-changed', {
        detail: {
          path: fullPath,
          originalContent: content,
          modifiedContent: finalContent
        }
      }))

      // Gancho LSP post-edición: sync + drain → <lsp-diagnostics> al contexto.
      const lspBlock = await lspAfterEdit(fullPath, finalContent)

      return {
        success: true,
        content: `Replaced text in: ${path}` + (lspBlock ? `\n\n${lspBlock}` : ''),
        filePath: path,
        originalContent: content,
        modifiedContent: finalContent
      }
    } else {
      return {
        success: false,
        content: `ERROR: Failed to write file: ${path}\n\n${writeResponse.error}`
      }
    }
  } catch (error) {
    return { success: false, content: `ERROR replacing in file: ${args.path}\n\n${error}` }
  }
}

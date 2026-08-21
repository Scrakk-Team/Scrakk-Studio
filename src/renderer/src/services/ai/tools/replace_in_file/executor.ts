import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'
import { lspAfterEdit } from '../../../lsp'

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const path = args.path as string
    const oldStr = args.old_str as string
    const newStr = args.new_str as string
    const fullPath = resolvePath(path, ctx.projectRoot)

    // Read existing content
    const readResponse = await window.api.fs.readFile(fullPath)
    if (!readResponse.success || readResponse.content === undefined) {
      return {
        success: false,
        content: `ERROR: File not found: ${path}\n\nThe file does not exist. Please check the path and try again.`
      }
    }

    let content = readResponse.content

    // Normalize for matching
    const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '')
    const normalizedContent = normalize(content)
    const normalizedOldStr = normalize(oldStr)

    // Try exact match first
    let searchStr = oldStr
    let replacementStr = newStr
    let count = content.split(searchStr).length - 1

    // If exact match fails, try normalized matching
    if (count === 0) {
      const normalizedCount = normalizedContent.split(normalizedOldStr).length - 1
      if (normalizedCount > 0) {
        content = normalizedContent
        searchStr = normalizedOldStr
        replacementStr = newStr
        count = normalizedCount
      }
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

    // Replace
    const newContent = content.replace(searchStr, replacementStr)
    const writeResponse = await window.api.fs.writeFile(fullPath, newContent)

    if (writeResponse.success) {
      window.dispatchEvent(new CustomEvent('refresh-explorer'))
      window.dispatchEvent(new CustomEvent('file-changed', {
        detail: {
          path: fullPath,
          originalContent: content,
          modifiedContent: newContent
        }
      }))

      // Gancho LSP post-edición: sync + drain → <lsp-diagnostics> al contexto.
      const lspBlock = await lspAfterEdit(fullPath, newContent)

      return {
        success: true,
        content: `Replaced text in: ${path}` + (lspBlock ? `\n\n${lspBlock}` : ''),
        filePath: path,
        originalContent: content,
        modifiedContent: newContent
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

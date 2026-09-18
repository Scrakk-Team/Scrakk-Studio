/**
 * ToolCallIcon — icono de cada tool de IA con proicons.
 *
 * Mapa tool → id canónico de productIcons (congruente con lo que hace cada
 * tool). Si el theme de iconos activo define el id, manda el glyph del
 * theme; si no, el proicon builtin. `icon` permite override por meta.
 */

import type { JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'

interface ToolCallIconProps {
  /** Tool name (e.g. 'read_file', 'execute_command') */
  toolName: string
  /** Override: id canónico de productIcons (viene de ToolMeta.icon) */
  icon?: string
  /** Size in pixels */
  size?: number
}

/** Tool de IA → id canónico de productIcons. Uno por tool, congruente. */
export const TOOL_PRODUCT_ICON_IDS: Record<string, string> = {
  read_file: 'file-text',
  read_multiple_files: 'file-multiple',
  write_file: 'pencil',
  append_file: 'plus',
  replace_in_file: 'refresh',
  delete_file: 'trash',
  move_file: 'arrow-right',
  list_directory: 'folder',
  file_search: 'search',
  grep_search: 'clipboard-search',
  execute_command: 'terminal',
  get_diagnostics: 'alert',
  history_title: 'history',
  list_browser_tabs: 'layers',
  navigate_web: 'compass',
  open_browser: 'globe',
  view_web: 'eye',
  lsp: 'server',
  multiple_tools: 'grid',
  create_app_blueprint: 'clipboard',
  adjust_timeout: 'timer'
}

export function ToolCallIcon({ toolName, icon, size = 14 }: ToolCallIconProps): JSX.Element {
  const id = icon || TOOL_PRODUCT_ICON_IDS[toolName] || 'box'
  return (
    <span
      className="tool-call-icon"
      data-tool={toolName}
      style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      <ProductIcon id={id} size={size} aria-hidden="true" />
    </span>
  )
}

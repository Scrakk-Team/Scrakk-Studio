/**
 * Utility functions for tools
 */

/**
 * Resolve a path relative to the project root.
 * If the path is already absolute, returns it as-is.
 */
export function resolvePath(pathStr: string, projectRoot?: string): string {
  if (!pathStr) return projectRoot ?? ''

  // Already absolute
  if (pathStr.startsWith('/') || /^[A-Za-z]:/.test(pathStr)) {
    return pathStr
  }

  // Strip leading ./
  let cleaned = pathStr
  if (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2)
  }

  if (!projectRoot) {
    return cleaned
  }

  // Normalize separators
  const normalizedRoot = projectRoot.replace(/\\/g, '/')
  const normalizedPath = cleaned.replace(/\\/g, '/')

  // Avoid double slashes
  const root = normalizedRoot.endsWith('/') ? normalizedRoot.slice(0, -1) : normalizedRoot
  return `${root}/${normalizedPath}`
}

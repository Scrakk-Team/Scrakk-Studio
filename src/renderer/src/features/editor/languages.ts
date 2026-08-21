/**
 * Mapeo de extensiones de archivo a identificadores de lenguaje para Tree-sitter e Innerta.
 * Módulo desacoplado y extensible para detección de sintaxis.
 */

export interface LanguageDefinition {
  id: string
  name: string
  extensions: string[]
  filenames?: string[]
}

export const SUPPORTED_LANGUAGES: LanguageDefinition[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['ts', 'mts', 'cts']
  },
  {
    id: 'tsx',
    name: 'TypeScript React',
    extensions: ['tsx']
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs', 'jsx']
  },
  {
    id: 'json',
    name: 'JSON',
    extensions: ['json', 'jsonc', 'json5']
  },
  {
    id: 'python',
    name: 'Python',
    extensions: ['py', 'pyw', 'pyi']
  },
  {
    id: 'rust',
    name: 'Rust',
    extensions: ['rs']
  },
  {
    id: 'cpp',
    name: 'C / C++',
    extensions: ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp', 'hxx', 'hh']
  },
  {
    id: 'css',
    name: 'CSS',
    extensions: ['css', 'scss', 'less']
  },
  {
    id: 'html',
    name: 'HTML',
    extensions: ['html', 'htm', 'xhtml']
  },
  {
    id: 'markdown',
    name: 'Markdown',
    extensions: ['md', 'markdown', 'mdown', 'mkd']
  },
  {
    id: 'go',
    name: 'Go',
    extensions: ['go']
  },
  {
    id: 'bash',
    name: 'Shell Script',
    extensions: ['sh', 'bash', 'zsh']
  },
  {
    id: 'ruby',
    name: 'Ruby',
    extensions: ['rb', 'rake']
  },
  {
    id: 'c_sharp',
    name: 'C#',
    extensions: ['cs']
  },
  {
    id: 'toml',
    name: 'TOML',
    extensions: ['toml']
  },
  {
    id: 'yaml',
    name: 'YAML',
    extensions: ['yaml', 'yml']
  }
]

const EXTENSION_MAP = new Map<string, string>()
const FILENAME_MAP = new Map<string, string>()

for (const lang of SUPPORTED_LANGUAGES) {
  for (const ext of lang.extensions) {
    EXTENSION_MAP.set(ext.toLowerCase(), lang.id)
  }
  if (lang.filenames) {
    for (const name of lang.filenames) {
      FILENAME_MAP.set(name.toLowerCase(), lang.id)
    }
  }
}

/**
 * Detecta el ID del lenguaje compatible con Tree-sitter a partir de la ruta del archivo.
 */
export function detectLanguageFromPath(filePath: string): string | null {
  if (!filePath) return null
  const filename = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  if (FILENAME_MAP.has(filename)) {
    return FILENAME_MAP.get(filename) ?? null
  }
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1) return null
  const ext = filename.slice(dotIndex + 1)
  return EXTENSION_MAP.get(ext) ?? null
}

/**
 * Mapeo de extensiones de archivo a identificadores de lenguaje para Tree-sitter e Innerta.
 * Módulo desacoplado y extensible para detección de sintaxis.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL `id` NO ES UN NOMBRE LIBRE: LO CONSUME EL MOTOR
 *
 * Este id viaja tal cual a `_SetInnertaLanguage` (`innertaLoader.ts`), así que
 * tiene que ser EXACTAMENTE uno de los que el motor tiene compilados. Si no lo
 * es, el motor cae a `plaintext` y el archivo se pinta sólo con lo que aporten
 * el LSP y las extensiones — un "no pinta" invisible, sin error.
 *
 * Los ids válidos son los de `deps/languages.json` del motor (18 entradas) más
 * `tsx` (parser propio dentro del repo de TypeScript) y `plaintext` (explícito:
 * "sin gramática"), que es lo que acepta `UpdateLanguageFromExtension` /
 * `SetLanguageId` en `EditorWindow.cpp`:
 *
 *   python javascript typescript tsx c cpp rust go java json html css bash
 *   c_sharp ruby lua toml yaml markdown plaintext
 *
 * Los alias (`json5`, `scss`, `xhtml`…) apuntan al id del motor que más se le
 * acerca: es la gramática disponible, no una promesa de soporte exacto.
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
    // El motor tiene DOS parsers distintos (`tree-sitter-c` y `tree-sitter-cpp`):
    // mandar `.c` como `cpp` pintaba C puro con la gramática de C++.
    id: 'c',
    name: 'C',
    extensions: ['c', 'h']
  },
  {
    id: 'cpp',
    name: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'c++', 'hpp', 'hxx', 'hh']
  },
  {
    id: 'java',
    name: 'Java',
    extensions: ['java']
  },
  {
    id: 'go',
    name: 'Go',
    extensions: ['go']
  },
  {
    id: 'c_sharp',
    name: 'C#',
    extensions: ['cs']
  },
  {
    id: 'ruby',
    name: 'Ruby',
    extensions: ['rb', 'rake']
  },
  {
    id: 'lua',
    name: 'Lua',
    extensions: ['lua']
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
    id: 'bash',
    name: 'Shell Script',
    extensions: ['sh', 'bash', 'zsh']
  },
  {
    id: 'markdown',
    name: 'Markdown',
    extensions: ['md', 'markdown', 'mdown', 'mkd']
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

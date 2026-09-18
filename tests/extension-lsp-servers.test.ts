/**
 * Tipo de extensión `lspServers` — schema y resolución de `command`.
 *
 * El caso que motiva estos tests: un LSP de VS Code viaja DENTRO de la
 * extensión (su entry es un módulo node, `./server/out/server.js`). El manager
 * sólo sabe buscar en el PATH, en los directorios gestionados (`~/.scrakk/lsp`)
 * o instalar por receta — así que la ruta al archivo del paquete tiene que
 * resolverse ANTES de registrarla, y sólo cuando el `command` la declara
 * relativa.
 */

import { describe, expect, it } from 'vitest'
import { resolveServerCommand } from '../src/renderer/src/services/extensions/types/lsp/logic'
import { parseLspContributions } from '../src/renderer/src/services/extensions/types/lsp/schema'

const CTX = { hasModule: () => true }

describe('resolveServerCommand', () => {
  it('resuelve una ruta relativa contra la raíz del paquete', () => {
    expect(resolveServerCommand('./server/out/server.js', '/home/u/.scrakk/extensions/toml')).toBe(
      '/home/u/.scrakk/extensions/toml/server/out/server.js'
    )
    expect(resolveServerCommand('./bin/x', '/w/ext/')).toBe('/w/ext/bin/x')
  })

  it('normaliza los `../` de la ruta', () => {
    expect(resolveServerCommand('../shared/server.js', '/w/ext/pkg')).toBe(
      '/w/ext/shared/server.js'
    )
    expect(resolveServerCommand('../../shared/server.js', '/w/ext/pkg')).toBe(
      '/w/shared/server.js'
    )
  })

  it('mantiene la unidad en Windows', () => {
    expect(resolveServerCommand('./server.js', 'C:/Users/u/ext')).toBe(
      'C:/Users/u/ext/server.js'
    )
  })

  it('deja intacto un binario del sistema (el manager lo busca o lo instala)', () => {
    expect(resolveServerCommand('ocamllsp', '/w/ext')).toBe('ocamllsp')
    expect(resolveServerCommand('ruby-lsp', undefined)).toBe('ruby-lsp')
    // Con barra pero SIN `./`: puede venir del PATH (el CLI lo usa así).
    expect(resolveServerCommand('node_modules/.bin/x', '/w/ext')).toBe('node_modules/.bin/x')
  })

  it('sin raíz de paquete la ruta relativa se deja tal cual', () => {
    expect(resolveServerCommand('./server/out/server.js', undefined)).toBe('./server/out/server.js')
  })

  it('un flag no se toca (sólo las rutas declaradas relativas)', () => {
    expect(resolveServerCommand('--stdio', '/w/ext')).toBe('--stdio')
    expect(resolveServerCommand('language-server', '/w/ext')).toBe('language-server')
  })
})

describe('parseLspContributions', () => {
  it('conserva un server completo', () => {
    const parsed = parseLspContributions(
      [
        {
          id: 'toml',
          command: './server/out/server.js',
          extensions: { '.toml': 'toml', toml: 'toml' },
          rootMarkers: ['Cargo.toml'],
          initializationOptions: { cache: true }
        }
      ],
      CTX
    )
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0].id).toBe('toml')
    // La extensión se normaliza con punto (el manager routea por extensión).
    expect(parsed?.[0].extensions).toEqual({ '.toml': 'toml' })
    expect(parsed?.[0].rootMarkers).toEqual(['Cargo.toml'])
    expect(parsed?.[0].initializationOptions).toEqual({ cache: true })
  })

  it('descarta una contribución sin command y una con receta inválida', () => {
    const parsed = parseLspContributions(
      [
        { id: 'sin-command' },
        { id: 'receta-rara', command: 'x', extensions: {}, install: { kind: 'apt' } }
      ],
      CTX
    )
    // `sin-command` cae (no hay a qué apuntar); `receta-rara` sobrevive sin la
    // receta: el server existe, lo que no existe es CÓMO instalarlo.
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0].id).toBe('receta-rara')
    expect(parsed?.[0].install).toBeUndefined()
  })

  it('un slice que no es lista no es una contribución', () => {
    expect(parseLspContributions({ id: 'x', command: 'y' }, CTX)).toBeNull()
    expect(parseLspContributions(null, CTX)).toBeNull()
  })
})

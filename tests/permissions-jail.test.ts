// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del jail de permisos — la garantía de que una extensión no puede
 * leer/robar cosas fuera del workspace ni tocar rutas sensibles.
 */

import { describe, it, expect } from 'vitest'
import {
  canReadDocument,
  checkPathAccess,
  hasPermission,
  normalizeFsPath,
  PERMISSIONS
} from '../src/shared/permissions'

const HOME = '/home/dev'

function ctx(
  declared: string[] | null,
  roots: string[] = ['/home/dev/proyectos/mi-app']
) {
  return { declaredPermissions: declared, workspaceRoots: roots, homeDir: HOME }
}

describe('checkPathAccess — deny-by-default', () => {
  it('extensión desconocida → nada', () => {
    const result = checkPathAccess(ctx(null), 'read', '/home/dev/proyectos/mi-app/a.ts')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('no registrada')
  })

  it('sin permiso declarado → denegado aunque esté en el workspace', () => {
    const result = checkPathAccess(ctx([]), 'read', '/home/dev/proyectos/mi-app/a.ts')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('fs.read')
  })

  it('fs.read permite leer dentro del workspace', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ]),
      'read',
      '/home/dev/proyectos/mi-app/src/a.ts'
    )
    expect(result.allowed).toBe(true)
  })

  it('fs.write NO habilita lectura (permisos separados)', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_WRITE]),
      'read',
      '/home/dev/proyectos/mi-app/a.ts'
    )
    expect(result.allowed).toBe(false)
  })
})

describe('checkPathAccess — jail al workspace', () => {
  it('fuera del workspace → denegado', () => {
    for (const mode of ['read', 'write'] as const) {
      const result = checkPathAccess(
        ctx([PERMISSIONS.FS_READ, PERMISSIONS.FS_WRITE]),
        mode,
        '/home/dev/proyectos/OTRO-proyecto/secreto.txt'
      )
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('fuera del workspace')
    }
  })

  it('multi-root: cualquier root registrado cuenta', () => {
    const multi = ctx([PERMISSIONS.FS_READ], [
      '/home/dev/proyectos/mi-app',
      '/home/dev/proyectos/lib'
    ])
    expect(checkPathAccess(multi, 'read', '/home/dev/proyectos/lib/x.ts').allowed).toBe(true)
    expect(checkPathAccess(multi, 'read', '/home/dev/proyectos/mi-app/x.ts').allowed).toBe(true)
  })

  it('sin workspace abierto → denegado', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ], []),
      'read',
      '/home/dev/proyectos/mi-app/a.ts'
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('sin workspace')
  })

  it('prefijo-trap: /mi-app2 no cuenta como /mi-app', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ]),
      'read',
      '/home/dev/proyectos/mi-app2/a.ts'
    )
    expect(result.allowed).toBe(false)
  })
})

describe('checkPathAccess — rutas sensibles SIEMPRE bloqueadas', () => {
  const sensitiveTargets = [
    '/home/dev/.ssh/id_rsa',
    '/home/dev/.ssh/known_hosts',
    '/home/dev/.aws/credentials',
    '/home/dev/.gcloud/credentials.db',
    '/home/dev/.kube/config',
    '/home/dev/certs/server.pem',
    '/home/dev/keys/app.key',
    '/home/dev/.gnupg/secring.gpg',
    '/home/dev/.netrc'
  ]

  for (const target of sensitiveTargets) {
    it(`bloquea ${target} incluso con fs.all`, () => {
      const result = checkPathAccess(
        ctx([PERMISSIONS.FS_READ, PERMISSIONS.FS_WRITE, PERMISSIONS.FS_ALL]),
        'read',
        target
      )
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('sensible')
    })
  }

  it('fs.all permite lo demás fuera del workspace (explícito)', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ, PERMISSIONS.FS_ALL]),
      'read',
      '/opt/algun/dato.json'
    )
    expect(result.allowed).toBe(true)
  })
})

describe('hasPermission', () => {
  it('null = nunca', () => {
    expect(hasPermission(null, PERMISSIONS.LSP_USE)).toBe(false)
  })

  it('declarado = sí', () => {
    expect(hasPermission([PERMISSIONS.LSP_USE], PERMISSIONS.LSP_USE)).toBe(true)
  })
})

// ── Regresión: escape del jail con '..' ────────────────────────────────────
//
// Antes, `isInsideAny` comparaba la ruta CRUDA con `startsWith`. Eso hacía que
// cualquier ruta que EMPEZARA por un root pasara el jail, y `<root>/../../..`
// empieza por `<root>/`. Una extensión con `fs.read` alcanzaba cualquier archivo
// del disco. Estos tests son la red que lo sostiene cerrado.

describe('checkPathAccess — el jail resiste traversal ".."', () => {
  // Cada entrada es una ruta que el jail NO debe autorizar.
  const escapes = [
    ['sube tres niveles', '/home/dev/proyectos/mi-app/../../../etc/passwd'],
    ['sube desde un subdirectorio', '/home/dev/proyectos/mi-app/src/../../../../root/.bashrc'],
    ['escapa lateralmente', '/home/dev/proyectos/mi-app/../lib/secreto.ts'],
    ['trailing .. en el root', '/home/dev/proyectos/mi-app/..'],
    ['mezcla puntos Current', '/home/dev/proyectos/mi-app/./../../etc/shadow'],
    ['doble barra escapatoria', '/home/dev/proyectos/mi-app//../../../etc/hosts']
  ] as const

  for (const [label, target] of escapes) {
    it(`deniega: ${label}`, () => {
      const result = checkPathAccess(ctx([PERMISSIONS.FS_READ, PERMISSIONS.FS_WRITE]), 'read', target)
      expect(result.allowed).toBe(false)
    })
  }

  it('deniega el traversal también para escritura', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_WRITE]),
      'write',
      '/home/dev/proyectos/mi-app/../../../../tmp/plantado.txt'
    )
    expect(result.allowed).toBe(false)
  })

  it('las rutas legítimas con .. que SÍ quedan dentro siguen permitidas', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ]),
      'read',
      '/home/dev/proyectos/mi-app/src/lib/../index.ts'
    )
    expect(result.allowed).toBe(true)
  })
})

describe('checkPathAccess — traversal en Windows', () => {
  const winCtx = (declared: string[], roots = ['C:/ws/proyecto']) => ({
    declaredPermissions: declared,
    workspaceRoots: roots,
    homeDir: 'C:/Users/victim'
  })

  const windowsEscapes = [
    ['barras invertidas', 'C:\\ws\\proyecto\\..\\..\\Users\\victim\\Documents\\impuestos.pdf'],
    ['mezcla de barras', 'C:/ws/proyecto/../../../Users/victim/.bashrc'],
    ['sube al directorio del user', 'C:/ws/proyecto/..'],
    ['config de la app', 'C:/ws/proyecto/../../Users/victim/AppData/Roaming/Scrakk/token.json']
  ] as const

  for (const [label, target] of windowsEscapes) {
    it(`deniega: ${label}`, () => {
      const result = checkPathAccess(winCtx([PERMISSIONS.FS_READ, PERMISSIONS.FS_WRITE]), 'read', target)
      expect(result.allowed).toBe(false)
    })
  }

  it('permite la ruta real dentro del workspace en Windows', () => {
    const result = checkPathAccess(winCtx([PERMISSIONS.FS_READ]), 'read', 'C:/ws/proyecto/src/a.ts')
    expect(result.allowed).toBe(true)
  })
})

describe('checkPathAccess — rutas sensibles tras normalizar', () => {
  it('bloquea una ruta sensible alcanzada con ..', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ, PERMISSIONS.FS_WRITE]),
      'read',
      '/home/dev/proyectos/mi-app/../../.ssh/id_rsa'
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('sensible')
  })

  it('bloquea una ruta sensible alcanzada con barras invertidas en Windows', () => {
    const result = checkPathAccess(
      {
        declaredPermissions: [PERMISSIONS.FS_READ],
        workspaceRoots: ['C:/ws/proyecto'],
        homeDir: 'C:/Users/victim'
      },
      'read',
      'C:/ws/proyecto/..\\..\\Users\\victim\\.aws\\credentials'
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('sensible')
  })
})

describe('checkPathAccess — entradas degeneradas', () => {
  it('rechaza una ruta con NUL', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ]),
      'read',
      '/home/dev/proyectos/mi-app/a.ts\0.png'
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('inválida')
  })

  it('una ruta RELATIVA nunca está dentro de un root absoluto', () => {
    const result = checkPathAccess(ctx([PERMISSIONS.FS_READ]), 'read', 'src/index.ts')
    expect(result.allowed).toBe(false)
  })

  it('el jail sigue funcionando cuando el root trae un ..', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ], ['/home/dev/proyectos/mi-app/./']),
      'read',
      '/home/dev/proyectos/mi-app/a.ts'
    )
    expect(result.allowed).toBe(true)
  })
})

describe('normalizeFsPath', () => {
  it('colapsa separadores y resuelve .', () => {
    expect(normalizeFsPath('/a//b/./c/')).toBe('/a/b/c')
  })

  it('resuelve .. por POSIX', () => {
    expect(normalizeFsPath('/a/b/../../c')).toBe('/c')
  })

  it('conserva la letra de unidad en Windows', () => {
    expect(normalizeFsPath('C:/ws/proyecto/src/../index.ts')).toBe('C:/ws/proyecto/index.ts')
  })

  it('normaliza barras invertidas de Windows', () => {
    expect(normalizeFsPath('C:\\ws\\proyecto\\..\\otro')).toBe('C:/ws/otro')
  })

  it('un .. de más contra la raíz se descarta, igual que path.resolve', () => {
    expect(normalizeFsPath('/../../a')).toBe('/a')
  })

  it('la raíz POSIX se mantiene como "/"', () => {
    expect(normalizeFsPath('/')).toBe('/')
  })

  it('un root con ".." se normaliza antes de comparar', () => {
    expect(normalizeFsPath('/home/dev/proyectos/./mi-app/../mi-app/a.ts')).toBe(
      '/home/dev/proyectos/mi-app/a.ts'
    )
  })

  it('una raíz POSIX sigue funcionando como raíz (regresión del prefijo "//")', () => {
    const result = checkPathAccess(
      ctx([PERMISSIONS.FS_READ], ['/']),
      'read',
      '/etc/hosts'
    )
    expect(result.allowed).toBe(true)
  })
})

describe('canReadDocument — texto de documentos por sesión', () => {
  const roots = ['/home/dev/proyectos/mi-app']

  it('entrega documentos del workspace solo con fs.read', () => {
    expect(canReadDocument([PERMISSIONS.FS_READ], roots, roots[0] + '/src/a.ts')).toBe(true)
    expect(canReadDocument([], roots, roots[0] + '/src/a.ts')).toBe(false)
    expect(canReadDocument(null, roots, roots[0] + '/src/a.ts')).toBe(false)
  })

  it('no entrega archivos fuera del workspace', () => {
    expect(canReadDocument([PERMISSIONS.FS_READ], roots, '/home/dev/.aws/credentials')).toBe(false)
    expect(canReadDocument([PERMISSIONS.FS_READ], roots, roots[0] + '-evil/a.ts')).toBe(false)
    expect(canReadDocument([PERMISSIONS.FS_READ], roots, roots[0] + '/../.ssh/id_rsa')).toBe(false)
  })
})

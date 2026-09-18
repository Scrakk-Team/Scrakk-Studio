/**
 * Tests del jail de permisos — la garantía de que una extensión no puede
 * leer/robar cosas fuera del workspace ni tocar rutas sensibles.
 */

import { describe, it, expect } from 'vitest'
import {
  checkPathAccess,
  hasPermission,
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

/**
 * Tests del historial de workspaces (servicio + navegación).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  baseNameOf,
  listWorkspaces,
  getActiveWorkspace,
  recordWorkspace,
  prevWorkspace,
  nextWorkspace,
  subscribeToWorkspaces,
  _resetWorkspacesForTests
} from '../src/renderer/src/services/workspaces/history'

describe('workspaces — baseNameOf real (sin hardcodear)', () => {
  it('deriva el nombre de la carpeta del path', () => {
    expect(baseNameOf('/home/julian/Documentos/Proyectos/jokit')).toBe('jokit')
    expect(baseNameOf('C:\\proyectos\\mi-app\\')).toBe('mi-app')
    expect(baseNameOf('/solo')).toBe('solo')
  })
})

describe('workspaces — historial', () => {
  beforeEach(() => {
    _resetWorkspacesForTests()
  })

  it('arranca vacío sin activo', () => {
    expect(listWorkspaces()).toEqual([])
    expect(getActiveWorkspace()).toBeNull()
  })

  it('record: nuevas primero + dedupe + activo', () => {
    recordWorkspace('/p/alpha')
    recordWorkspace('/p/beta')
    recordWorkspace('/p/alpha')
    expect(listWorkspaces()).toEqual(['/p/alpha', '/p/beta'])
    expect(getActiveWorkspace()).toBe('/p/alpha')
  })

  it('prev/next navegan el historial', () => {
    recordWorkspace('/p/uno')
    recordWorkspace('/p/dos')
    recordWorkspace('/p/tres')
    // Orden: tres, dos, uno — el activo es tres (último registrado).
    expect(prevWorkspace('/p/dos')).toBe('/p/tres')
    expect(nextWorkspace('/p/dos')).toBe('/p/uno')
    // Bordes: null donde no hay.
    expect(prevWorkspace('/p/tres')).toBeNull()
    expect(nextWorkspace('/p/uno')).toBeNull()
    expect(prevWorkspace(null)).toBeNull()
    expect(nextWorkspace('/p/fuera')).toBeNull()
  })

  it('ignora paths vacíos', () => {
    recordWorkspace('   ')
    expect(listWorkspaces()).toEqual([])
  })

  it('subscribe notifica solo cuando cambia', () => {
    let calls = 0
    const unsub = subscribeToWorkspaces(() => calls++)
    recordWorkspace('/p/a')
    recordWorkspace('/p/b')
    recordWorkspace('/p/b')
    expect(calls).toBe(2)
    unsub()
  })
})

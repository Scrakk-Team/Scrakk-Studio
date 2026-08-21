/**
 * Tests del sistema de carpetas .scrakk — capas usuario/proyecto.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import {
  scrakkHome,
  userConfigPath,
  projectConfigPath,
  readJsonLayer,
  writeJsonLayer,
  loadLayered,
  useScrakkHomeForTests,
  resetScrakkHome
} from '../../src/main/scrakkFolder'
import { makeTempDir, cleanupDir } from '../helpers/lsp-test-utils'

let homeDir: string | undefined
let projectDir: string | undefined

beforeEach(async () => {
  homeDir = await makeTempDir('scrakk-home-')
  projectDir = await makeTempDir('scrakk-project-')
  useScrakkHomeForTests(homeDir)
})

afterEach(async () => {
  resetScrakkHome()
  await cleanupDir(homeDir)
  await cleanupDir(projectDir)
})

describe('scrakkFolder', () => {
  it('resuelve rutas ~/.scrakk y <root>/.scrakk', () => {
    expect(scrakkHome()).toBe(homeDir)
    expect(userConfigPath('lsp.json')).toBe(path.join(homeDir!, 'lsp.json'))
    expect(projectConfigPath(projectDir!, 'lsp.json')).toBe(
      path.join(projectDir!, '.scrakk', 'lsp.json')
    )
  })

  it('readJsonLayer devuelve null si no existe o es inválido', async () => {
    expect(await readJsonLayer(userConfigPath('nope.json'))).toBeNull()

    await writeJsonLayer(userConfigPath('broken.json'), { a: 1 })
    // escribir válido y leerlo
    expect(await readJsonLayer(userConfigPath('broken.json'))).toEqual({ a: 1 })
  })

  it('writeJsonLayer crea la carpeta y escribe JSON legible', async () => {
    const written = await writeJsonLayer(projectConfigPath(projectDir!, 'tooling.json'), {
      enabled: true
    })
    expect(written).not.toBeNull()
    expect(await readJsonLayer(written!)).toEqual({ enabled: true })
  })

  it('loadLayered fusiona: proyecto gana sobre usuario', async () => {
    await writeJsonLayer(userConfigPath('lsp.json'), {
      shared: { from: 'user' },
      onlyUser: { from: 'user' }
    })
    await writeJsonLayer(projectConfigPath(projectDir!, 'lsp.json'), {
      shared: { from: 'project' }
    })

    const result = await loadLayered('lsp.json', projectDir!, (raw) => raw as { from: string })

    expect(result.merged.shared).toEqual({ from: 'project' })
    expect(result.merged.onlyUser).toEqual({ from: 'user' })
    expect(result.sources.shared).toBe('project')
    expect(result.sources.onlyUser).toBe('user')
  })

  it('loadLayered descarta entradas que el parser rechaza', async () => {
    await writeJsonLayer(userConfigPath('lsp.json'), {
      good: { ok: true },
      bad: 'no-es-objeto'
    })

    const result = await loadLayered('lsp.json', projectDir!, (raw) => {
      if (raw && typeof raw === 'object') return raw as { ok: boolean }
      return null
    })

    expect(Object.keys(result.merged)).toEqual(['good'])
  })
})

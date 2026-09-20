/**
 * Sistema de carpetas `.scrakk` — configuración por usuario y por proyecto.
 *
 * Mismo layout que detecta scrakk-cli:
 *  - Usuario:  ~/.scrakk/<file>.json
 *  - Proyecto: <root>/.scrakk/<file>.json  (gana sobre usuario)
 *
 * Modularizado: cualquier subsistema (lsp hoy, lo que venga mañana) pide su
 * archivo por nombre; aquí vive la única lógica de rutas, lectura, escritura
 * y merge en capas. El renderer accede vía IPC o vía el storage service para
 * sus propias preferencias.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'node:os'

/** Directorio home de Scrakk (~/.scrakk). En dev/test se puede overridear. */
export function scrakkHome(): string {
  return process.env.SCRAKK_HOME ?? path.join(os.homedir(), '.scrakk')
}

/** Directorio .scrakk de un proyecto. */
export function projectScrakkDir(projectRoot: string): string {
  return path.join(projectRoot, '.scrakk')
}

/** Ruta absoluta de un archivo de config dentro de una capa. */
export function userConfigPath(fileName: string): string {
  return path.join(scrakkHome(), fileName)
}

export function projectConfigPath(projectRoot: string, fileName: string): string {
  return path.join(projectScrakkDir(projectRoot), fileName)
}

/**
 * Lee un JSON de una capa. Devuelve null si no existe o es inválido
 * (mismo comportamiento tolerante que el CLI: config rota ≠ crash).
 */
export async function readJsonLayer(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Escribe un JSON en una capa creando la carpeta si falta.
 * Devuelve la ruta escrita o null en error.
 */
export async function writeJsonLayer(
  filePath: string,
  data: Record<string, unknown>
): Promise<string | null> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
    return filePath
  } catch {
    return null
  }
}

export interface LayeredResult<T> {
  /** Mapa fusionado (proyecto gana sobre usuario). */
  merged: Record<string, T>
  /** Origen de cada entrada tras el merge. */
  sources: Record<string, 'user' | 'project'>
  userPath: string
  projectPath: string
}

/**
 * Fusión en capas usuario → proyecto de un archivo `<name>.json`.
 * `parseEntry` valida/normaliza cada valor; las entradas inválidas se
 * descartan con warning (tolerante, como el CLI).
 */
export async function loadLayered<T>(
  fileName: string,
  projectRoot: string,
  parseEntry: (raw: unknown, key: string) => T | null
): Promise<LayeredResult<T>> {
  const userPath = userConfigPath(fileName)
  const projectPath = projectConfigPath(projectRoot, fileName)

  const merged: Record<string, T> = {}
  const sources: Record<string, 'user' | 'project'> = {}

  const userLayer = await readJsonLayer(userPath)
  if (userLayer) {
    for (const [key, raw] of Object.entries(userLayer)) {
      const parsed = parseEntry(raw, key)
      if (parsed === null) continue
      merged[key] = parsed
      sources[key] = 'user'
    }
  }

  const projectLayer = await readJsonLayer(projectPath)
  if (projectLayer) {
    for (const [key, raw] of Object.entries(projectLayer)) {
      const parsed = parseEntry(raw, key)
      if (parsed === null) continue
      merged[key] = parsed
      sources[key] = 'project'
    }
  }

  return { merged, sources, userPath, projectPath }
}

/** Home efectivo para tests/dev sin tocar el real del usuario. */
export function useScrakkHomeForTests(homeDir: string): void {
  process.env.SCRAKK_HOME = homeDir
}

/** Reset del home (tests). */
export function resetScrakkHome(): void {
  delete process.env.SCRAKK_HOME
}

/**
 * Almacén de las extensiones (proceso main).
 *
 * Es el equivalente a lo que VS Code le garantiza a una extensión ANTES de
 * `activate`: carpetas reales + estado ya leído. Sin esto, una extensión que
 * guarda credenciales o su base de tareas no arranca (ver Cline: `secrets` ×92,
 * `globalStorageUri` y `workspace.fs.stat` en su arranque).
 *
 * Layout, dentro de `userData/User` (el mismo nombre que usa VS Code para no
 * inventar otra convención):
 *
 *   globalStorage/<extensionId>/state.json      → globalState
 *   globalStorage/<extensionId>/secrets.json    → SecretStorage (cifrado)
 *   workspaceStorage/<hash>/<extensionId>/state.json → workspaceState
 *   workspaceStorage/<hash>/settings.json       → ajustes por workspace
 *   ext-settings.json                           → ajustes globales
 *   logs/<extensionId>/                          → logUri
 *
 * El cifrado es `safeStorage` de Electron cuando está disponible; si no (Linux
 * sin keyring), se guarda en claro y se AVISA en el log — mentir sobre el
 * cifrado sería peor que no cifrar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Todo el disco está acá, detrás de una clase con `baseDir` inyectable. Si
 * Owear cambia de runtime, se reescribe este archivo y nada más.
 */

import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ExtensionStoragePaths, MementoScope } from '@shared/extensionHost/protocol'

/** Cifrado de secretos (inyectable: en tests se usa el de mentira). */
export interface SecretCodec {
  /** ¿Cifra de verdad? (para poder avisar cuando no). */
  readonly encrypted: boolean
  encrypt(plain: string): string
  decrypt(stored: string): string
}

/** Lo mínimo de `safeStorage` de Electron que necesitamos (inyectable).
 * Se inyecta en vez de importar `electron` acá para que este módulo se pueda
 * testear en Node sin Electron.
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

/**
 * Codec con `safeStorage` cuando el sistema puede cifrar; si no, guarda en
 * claro con el prefijo `plain:` y lo AVISA (`encrypted: false`) para que quien
 * lo use lo pueda reportar. Mentir sobre el cifrado sería peor que no cifrar.
 */
export function createSafeStorageCodec(safe?: SafeStorageLike | null): SecretCodec {
  const available = Boolean(safe?.isEncryptionAvailable())
  return {
    encrypted: available,
    encrypt(plain: string): string {
      if (!available || !safe) return `plain:${Buffer.from(plain, 'utf8').toString('base64')}`
      return `safe:${safe.encryptString(plain).toString('base64')}`
    },
    decrypt(stored: string): string {
      if (stored.startsWith('plain:')) {
        return Buffer.from(stored.slice('plain:'.length), 'base64').toString('utf8')
      }
      if (stored.startsWith('safe:') && safe) {
        return safe.decryptString(Buffer.from(stored.slice('safe:'.length), 'base64'))
      }
      return ''
    }
  }
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Escritura atómica: un crash no deja un JSON a medias (el storage se lee al arrancar). */
async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

export class ExtensionStorage {
  private readonly baseDir: string
  private readonly codec: SecretCodec
  /** Cache de lo leído/escrito por archivo (evita leer en cada `get`). */
  private readonly cache = new Map<string, Record<string, unknown>>()

  constructor(options: { baseDir: string; codec?: SecretCodec }) {
    this.baseDir = options.baseDir
    this.codec = options.codec ?? createSafeStorageCodec()
  }

  get secretsEncrypted(): boolean {
    return this.codec.encrypted
  }

  /** Raíz de un scope (global o por workspace). */
  private scopeRoot(scope: MementoScope, workspaceRoot: string | null): string {
    if (scope === 'global') return join(this.baseDir, 'globalStorage')
    return join(this.baseDir, 'workspaceStorage', workspaceKey(workspaceRoot))
  }

  /**
   * Rutas REALES de la extensión, creadas si no existen.
   *
   * Es lo que en VS Code son `globalStorageUri`, `storageUri` y `logUri`: se
   * crean ANTES de activar porque hay extensiones que escriben ahí en la
   * primera línea de `activate()`.
   */
  async ensurePaths(extensionId: string, workspaceRoot: string | null): Promise<ExtensionStoragePaths> {
    const globalStorage = join(this.scopeRoot('global', null), extensionId)
    const workspaceStorage = join(this.scopeRoot('workspace', workspaceRoot), extensionId)
    const logs = join(this.baseDir, 'logs', extensionId)
    await Promise.all([
      fs.mkdir(join(globalStorage, ''), { recursive: true }),
      fs.mkdir(join(workspaceStorage, ''), { recursive: true }),
      fs.mkdir(join(logs, ''), { recursive: true })
    ])
    return { globalStorage, workspaceStorage, logs }
  }

  /** Estado persistido de un scope (lo que lee `globalState` al arrancar). */
  async readState(extensionId: string, scope: MementoScope, workspaceRoot: string | null): Promise<Record<string, unknown>> {
    return await readJson(this.stateFile(extensionId, scope, workspaceRoot))
  }

  /** Persiste UNA clave (el `update()` del memento). */
  async writeState(
    extensionId: string,
    scope: MementoScope,
    workspaceRoot: string | null,
    key: string,
    value: unknown
  ): Promise<void> {
    const file = this.stateFile(extensionId, scope, workspaceRoot)
    const current = this.cache.get(file) ?? (await readJson(file))
    if (value === undefined) delete current[key]
    else current[key] = value
    this.cache.set(file, current)
    await writeJson(file, current)
  }

  async getSecret(extensionId: string, key: string): Promise<string | undefined> {
    const values = await readJson(this.secretsFile(extensionId))
    const stored = values[key]
    if (typeof stored !== 'string') return undefined
    try {
      return this.codec.decrypt(stored)
    } catch {
      // Un secreto que no se puede descifrar (keyring cambiado) se trata como
      // ausente: la extensión vuelve a pedir la credencial.
      return undefined
    }
  }

  async storeSecret(extensionId: string, key: string, value: string): Promise<void> {
    const file = this.secretsFile(extensionId)
    const values = await readJson(file)
    values[key] = this.codec.encrypt(value)
    await writeJson(file, values)
  }

  async deleteSecret(extensionId: string, key: string): Promise<void> {
    const file = this.secretsFile(extensionId)
    const values = await readJson(file)
    if (!(key in values)) return
    delete values[key]
    await writeJson(file, values)
  }

  /**
   * Ajustes que las extensiones persistieron (`getConfiguration().update`).
   * `target` 2 (Workspace) los escribe en el scope del workspace; el resto en
   * los globales. Al leer, el workspace pisa al global (como VS Code).
   */
  async readConfiguration(workspaceRoot: string | null): Promise<Record<string, unknown>> {
    const global = await readJson(join(this.baseDir, 'ext-settings.json'))
    const workspace = await readJson(join(this.scopeRoot('workspace', workspaceRoot), 'settings.json'))
    return { ...global, ...workspace }
  }

  async writeConfiguration(
    key: string,
    value: unknown,
    target: number | undefined,
    workspaceRoot: string | null
  ): Promise<void> {
    const isWorkspace = target === 2
    const file = isWorkspace
      ? join(this.scopeRoot('workspace', workspaceRoot), 'settings.json')
      : join(this.baseDir, 'ext-settings.json')
    const current = await readJson(file)
    if (value === undefined) delete current[key]
    else current[key] = value
    await writeJson(file, current)
  }

  private stateFile(extensionId: string, scope: MementoScope, workspaceRoot: string | null): string {
    return join(this.scopeRoot(scope, workspaceRoot), extensionId, 'state.json')
  }

  private secretsFile(extensionId: string): string {
    return join(this.scopeRoot('global', null), extensionId, 'secrets.json')
  }
}

/**
 * Clave de workspace: hash corto de la raíz.
 *
 * Sin esto, dos proyectos distintos compartirían `workspaceState` (y los
 * ajustes por workspace), que es exactamente lo que no debe pasar.
 */
export function workspaceKey(workspaceRoot: string | null): string {
  if (!workspaceRoot) return 'no-workspace'
  return createHash('sha1').update(workspaceRoot).digest('hex').slice(0, 16)
}

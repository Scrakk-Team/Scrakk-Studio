/**
 * El `ExtensionContext` de verdad: estado persistido y secretos.
 *
 * VS Code garantiza dos cosas ANTES de llamar a `activate(context)`
 * (`extHostExtensionService.ts:_loadExtensionContext`):
 *  1. `globalState` / `workspaceState` ya están leídos y listos, y
 *  2. `context.secrets` funciona (es el almacén de credenciales).
 *
 * Y garantiza que `storageUri` / `globalStorageUri` / `logUri` son carpetas
 * REALES que existen. Sin eso, una extensión como Cline (que lee claves y
 * escribe su base de tareas al arrancar) no puede ni empezar: es la diferencia
 * entre "activa" y "se queda en iniciando".
 *
 * Qué NO persiste aquí: la decisión de persistir es del main (archivos suyos);
 * el host sólo pide `state/write` y `secrets/*` por el bridge. Así el shim
 * sigue sin tocar el disco y sigue siendo testeable.
 */

import { Disposable, EventEmitter, type VscodeShimOptions } from './vscodeShim'
import type { MementoLike } from './vscodeApi'
import type { MementoScope } from '@shared/extensionHost/protocol'

/**
 * Memento respaldado por el main.
 *
 * `get` es SINCRÓNICO (el API de VS Code lo es): se arranca con el snapshot que
 * vino en `init` y se mantiene una copia local al día. `update` avisa al main y
 * resuelve cuando quedó persistido.
 */
export function createPersistentMemento(
  scope: MementoScope,
  seed: Record<string, unknown>,
  write: (scope: MementoScope, key: string, value: unknown) => Promise<void>
): MementoLike {
  const store = new Map<string, unknown>(Object.entries(seed))
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      (store.has(key) ? (store.get(key) as T) : defaultValue),
    update: async (key: string, value: unknown): Promise<void> => {
      // Primero el cache local: `update` seguido de `get` tiene que ver el
      // valor nuevo aunque la escritura tarde (igual que VS Code).
      if (value === undefined) store.delete(key)
      else store.set(key, value)
      await write(scope, key, value)
    },
    keys: () => [...store.keys()]
  }
}

/** Lo que expone `context.secrets` (subconjunto real de `SecretStorage`). */
export interface SecretStorageLike {
  get(key: string): Promise<string | undefined>
  store(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  onDidChange(listener: (event: { key: string }) => void): Disposable
}

/**
 * SecretStorage respaldado por el main (que es quien guarda — y cifra si
 * puede—). El `onDidChange` se dispara con los cambios de ESTA extensión, que
 * es el caso que usa una extensión (avisar a su propia UI que la clave cambió).
 */
export function createSecretStorage(
  read: (key: string) => Promise<{ success: boolean; value?: string; error?: string }>,
  write: (key: string, value: string) => Promise<{ success: boolean; error?: string }>,
  remove: (key: string) => Promise<{ success: boolean; error?: string }>
): SecretStorageLike {
  const emitter = new EventEmitter<{ key: string }>()

  function fail(action: string, error?: string): never {
    throw new Error(`context.secrets.${action}: ${error ?? 'el almacén rechazó la operación'}`)
  }

  return {
    async get(key: string): Promise<string | undefined> {
      const result = await read(key)
      if (!result.success) fail('get', result.error)
      return result.value
    },
    async store(key: string, value: string): Promise<void> {
      const result = await write(key, value)
      if (!result.success) fail('store', result.error)
      emitter.fire({ key })
    },
    async delete(key: string): Promise<void> {
      const result = await remove(key)
      if (!result.success) fail('delete', result.error)
      emitter.fire({ key })
    },
    onDidChange: (listener) => emitter.event(listener)
  } as SecretStorageLike & { dispose?: () => void }
}

/**
 * Arma el `ExtensionContext` con las piezas reales.
 *
 * `extension.packageJSON` va con el contenido REAL del paquete: hay extensiones
 * (Cline entre ellas, en su loader de rollout) que leen `version` y `name` de
 * ahí en la primera línea, y un `{}` las deja tomando decisiones a ciegas.
 */
export function createExtensionContext(options: {
  shim: VscodeShimOptions
  subscriptions: Disposable[]
  globalState: MementoLike
  workspaceState: MementoLike
  secrets: SecretStorageLike
  makeUri: (path: string) => unknown
}): Record<string, unknown> {
  const { shim } = options
  const extensionPath = shim.extensionPath
  const storage = shim.storage
  const packageJSON = shim.packageJSON ?? {}

  const context: Record<string, unknown> = {
    subscriptions: options.subscriptions,
    extensionPath,
    extensionUri: options.makeUri(extensionPath),
    extension: {
      id: shim.extensionId,
      extensionPath,
      extensionUri: options.makeUri(extensionPath),
      isActive: true,
      packageJSON,
      exports: undefined
    },
    globalState: options.globalState,
    workspaceState: options.workspaceState,
    secrets: options.secrets,
    extensionMode: 1, // ExtensionMode.Production
    extensionKind: 1, // ExtensionKind.UI
    asAbsolutePath: (relative: string): string =>
      `${extensionPath.replace(/[\\/]+$/, '')}/${relative.replace(/^[\\/]+/, '')}`,
    environmentVariableCollection: {
      persistent: false,
      replace() {},
      append() {},
      prepend() {},
      get: () => undefined,
      forEach: () => undefined,
      delete() {},
      clear() {}
    }
  }

  if (storage) {
    const globalUri = options.makeUri(storage.globalStorage)
    const workspaceUri = options.makeUri(storage.workspaceStorage)
    context.globalStorageUri = globalUri
    context.storageUri = workspaceUri
    context.globalStoragePath = storage.globalStorage
    context.storagePath = storage.workspaceStorage
    context.logUri = options.makeUri(storage.logs)
    context.logPath = storage.logs
  } else {
    // Sin storage no se MIENTE con una ruta inventada: `undefined` es lo que
    // VS Code devuelve para storage no disponible, y la extensión puede
    // decidir (en vez de escribir en una carpeta que no existe).
    context.globalStorageUri = undefined
    context.storageUri = undefined
    context.logUri = undefined
  }

  return context
}

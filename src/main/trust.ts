// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Workspace Trust.
 *
 * El `.scrakk/lsp.json` de un proyecto puede declarar `command`, `args` y
 * `env`, y el manager los spawnea al abrir un archivo. En un repo clonado eso
 * es ejecución de código arbitrario con los privilegios del usuario, sin
 * ninguna interacción. Igual que VS Code, una config de ejecución del
 * workspace exige consentimiento explícito una vez por carpeta.
 *
 * El consentimiento se guarda en `userData/workspace-trust.json` (fuera del
 * repo, así el proyecto no puede auto-concederse confianza). "No confiar"
 * también se persiste para no repetir el diálogo en cada spawn.
 */

import { app, dialog } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { t } from '@shared/i18n'

interface TrustStore {
  trusted: string[]
  denied: string[]
}

const EMPTY: TrustStore = { trusted: [], denied: [] }

function storePath(): string {
  return path.join(app.getPath('userData'), 'workspace-trust.json')
}

function normalizeRoot(root: string): string {
  return path.resolve(root)
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

async function readStore(): Promise<TrustStore> {
  try {
    const raw = await fs.readFile(storePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<TrustStore>
    return { trusted: stringList(parsed.trusted), denied: stringList(parsed.denied) }
  } catch {
    return { ...EMPTY }
  }
}

async function writeStore(store: TrustStore): Promise<void> {
  try {
    const file = storePath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(store, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
  } catch {
    // Si no se puede persistir, el diálogo vuelve a salir: preferible a
    // ejecutar sin consentimiento.
  }
}

export async function isWorkspaceTrusted(root: string): Promise<boolean> {
  const store = await readStore()
  return store.trusted.includes(normalizeRoot(root))
}

/**
 * True si el usuario confía en el workspace. Si es la primera vez, pregunta.
 * `command` se muestra en el diálogo para que la decisión sea informada.
 * Denegar persiste la decisión (no vuelve a preguntar en cada spawn).
 */
export async function ensureWorkspaceTrusted(root: string, command: string): Promise<boolean> {
  // Escape hatch para CI/tests y automatizaciones que ya montan el workspace
  // a propósito. En la app normal nunca se define.
  if (process.env.SCRAKK_TRUST_PROJECT_LSP === '1') return true

  const key = normalizeRoot(root)
  const store = await readStore()
  if (store.trusted.includes(key)) return true
  if (store.denied.includes(key)) return false

  let response: { response: number }
  try {
    response = await dialog.showMessageBox({
      type: 'warning',
      title: t('main.trust.titulo'),
      message: t('main.trust.titulo'),
      detail: t('main.trust.mensaje', { root: key, command }),
      buttons: [t('main.trust.confiar'), t('main.trust.cancelar')],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
  } catch {
    // Sin diálogo disponible no se puede pedir consentimiento: fail-closed.
    return false
  }

  if (response.response !== 0) {
    store.denied.push(key)
    await writeStore(store)
    return false
  }

  store.denied = store.denied.filter((entry) => entry !== key)
  store.trusted.push(key)
  await writeStore(store)
  return true
}

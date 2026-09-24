// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Audit cruzado tabla ⇄ runtime.
 *
 * Se corre en los tests (y se puede correr a mano contra el host real). Las
 * dos direcciones importan:
 *
 *   auditApi    → el host tiene algo que la tabla no declara (tabla vieja).
 *   missingFromApi → la tabla declara real algo que el host no tiene (mentira).
 *
 * Cualquiera de las dos vacías es un bug; las dos vacías significan que la
 * tabla y el host cuentan la misma historia.
 */

import { getSurfaceNamespace, listSurfaceNamespaces } from './registry'

/** Namespaces que en el módulo `vscode` son OBJETOS (no clases ni valores). */
export const API_OBJECT_NAMESPACES = [
  'commands',
  'window',
  'workspace',
  'languages',
  'env',
  'extensions'
] as const

function declaredNames(namespaceId: string): Set<string> {
  const namespace = getSurfaceNamespace(namespaceId)
  const names = new Set<string>()
  for (const entry of namespace?.apis ?? []) {
    names.add(entry.key)
    for (const covered of entry.covers ?? []) names.add(covered)
  }
  return names
}

/** Miembros del api que NO están declarados en la tabla. */
export function auditApi(api: Record<string, unknown>): string[] {
  const undeclared: string[] = []

  for (const id of API_OBJECT_NAMESPACES) {
    const value = api[id]
    if (!value || typeof value !== 'object') {
      undeclared.push(`${id}: el namespace declarado no existe en el api`)
      continue
    }
    const declared = declaredNames(id)
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (!declared.has(key)) undeclared.push(`${id}.${key}`)
    }
  }

  const core = declaredNames('core')
  for (const key of Object.keys(api)) {
    if ((API_OBJECT_NAMESPACES as readonly string[]).includes(key)) continue
    if (!core.has(key)) undeclared.push(`core.${key}`)
  }

  return undeclared.sort()
}

/** Lo declarado como `real` que el api no tiene (o tiene roto). */
export function missingFromApi(api: Record<string, unknown>): string[] {
  const missing: string[] = []

  /**
   * ¿Existe la propiedad? Se pregunta con `in`, NO leyendo el valor: hay
   * miembros que devuelven `undefined` legítimamente (por ejemplo
   * `workspace.workspaceFolders` sin carpeta abierta) y otros que son
   * getters. Existencia es el contrato; el valor es de la extensión.
   */
  const hasPath = (path: string): boolean => {
    const [namespaceId, ...rest] = path.split('.')
    let current: unknown
    if (namespaceId === 'core') {
      // `core` es el nivel raíz del api: sus claves cuelgan directo.
      const name = rest.join('.')
      return Object.prototype.hasOwnProperty.call(api, name)
    }
    current = api[namespaceId]
    if (!current || (typeof current !== 'object' && typeof current !== 'function')) return false
    const container = current as Record<string, unknown>
    // Los miembros pueden ser props o métodos: `hasOwnProperty` cubre los
    // props y `name in container` cubre los que vengan del prototipo.
    return rest.every((part) => part in container) && rest.length > 0
  }

  // Solo los namespaces que SON el módulo `vscode`. `contributes` se verifica
  // contra los traductores y `textEditor` es un camino interno del editor.
  const runtimeNamespaces = new Set<string>([...API_OBJECT_NAMESPACES, 'core'])

  for (const namespace of listSurfaceNamespaces()) {
    if (!runtimeNamespaces.has(namespace.id)) continue
    for (const entry of namespace.apis) {
      if (entry.route !== 'host' || entry.status !== 'real') continue
      const names = entry.covers ?? [entry.key]
      for (const name of names) {
        const path = namespace.id === 'core' ? `core.${name}` : `${namespace.id}.${name}`
        if (!hasPath(path)) missing.push(path)
      }
    }
  }

  return missing.sort()
}

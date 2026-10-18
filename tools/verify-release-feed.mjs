#!/usr/bin/env node
// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Verificación del feed de electron-updater (`latest*.yml`).
 *
 * El bug real: `latest.yml` apuntaba a `Scrakk-Studio-Setup-0.1.4.exe` y el
 * asset publicado era `Scrakk.Studio.Setup-0.1.4.exe`. Windows descargaba un
 * 404 y el auto-update quedaba roto sin error visible.
 *
 * No hardcodea nombres de archivo: lee el YAML, extrae `path` y `files[].url`
 * y comprueba que existan en el directorio del release.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function unquote(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** Parsea el subconjunto de YAML que genera electron-builder. */
export function parseUpdateFeed(text) {
  const version = /^version:\s*(.+)$/m.exec(text)?.[1]
  const path = /^path:\s*(.+)$/m.exec(text)?.[1]
  const urls = [...text.matchAll(/^\s*-\s*url:\s*(.+)$/gm)].map((match) => unquote(match[1]))
  const normalizedPath = path ? unquote(path) : null
  return {
    version: version ? unquote(version) : null,
    path: normalizedPath,
    files: urls,
    targets: [...new Set([normalizedPath, ...urls].filter(Boolean))]
  }
}

/** Devuelve los `latest*.yml` de un directorio. */
export function findUpdateFeeds(dir) {
  try {
    return readdirSync(dir)
      .filter((name) => /^latest.*\.ya?ml$/i.test(name))
      .sort()
  } catch {
    return []
  }
}

/**
 * Verifica un directorio de release. No lanza: devuelve `{ ok, errors, feeds }`.
 */
export function verifyReleaseDir(dir) {
  const root = resolve(dir)
  const feeds = findUpdateFeeds(root)
  const errors = []
  if (feeds.length === 0) {
    return { ok: false, errors: [`No hay latest*.yml en ${root}`], feeds: [] }
  }

  for (const feed of feeds) {
    let text
    try {
      text = readFileSync(join(root, feed), 'utf-8')
    } catch {
      errors.push(`${feed}: no se pudo leer`)
      continue
    }
    const parsed = parseUpdateFeed(text)
    if (!parsed.version) errors.push(`${feed}: falta version`)
    if (parsed.targets.length === 0) errors.push(`${feed}: no contiene path ni files[].url`)
    for (const target of parsed.targets) {
      let decoded = target
      try {
        decoded = decodeURIComponent(target)
      } catch {
        // Nombre literal con `%` inválido: se usa tal cual.
      }
      const file = join(root, decoded)
      if (!existsSync(file) || !statSync(file).isFile()) {
        errors.push(`${feed}: referencia un archivo inexistente (${target})`)
      }
    }
  }

  return { ok: errors.length === 0, errors, feeds }
}

function usage() {
  console.log('uso: node tools/release/feed.mjs verify [--dir release]')
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  const command = process.argv[2] ?? 'verify'
  if (command === '--help' || command === '-h') {
    usage()
    process.exit(0)
  }
  if (command !== 'verify') {
    usage()
    process.exit(1)
  }
  const dirIndex = process.argv.indexOf('--dir')
  const dir = dirIndex >= 0 ? process.argv[dirIndex + 1] : 'release'
  const result = verifyReleaseDir(dir)
  if (result.ok) {
    console.log(`✓ feed OK (${result.feeds.join(', ')})`)
  } else {
    for (const error of result.errors) console.error(`✗ ${error}`)
    process.exitCode = 1
  }
}

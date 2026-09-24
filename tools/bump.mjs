// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'package.json')
const lockPath = join(root, 'package-lock.json')
const noPush = process.argv.includes('--no-push')

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: root })
}

function out(cmd) {
  return execSync(cmd, { cwd: root }).toString().trim()
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version ?? '')
if (!m) {
  console.error(`version actual invalida: ${pkg.version}`)
  process.exit(1)
}
let major = Number(m[1])
let minor = Number(m[2])
let patch = Number(m[3])

// Odometro base-10 en MINOR y PATCH: 0.1.9 -> 0.2.0, 0.9.9 -> 1.0.0.
// 0.x = beta, 1.0.0 = sale de beta (se sigue igual despues).
if (patch < 9) {
  patch += 1
} else {
  patch = 0
  if (minor < 9) {
    minor += 1
  } else {
    minor = 0
    major += 1
  }
}

const next = `${major}.${minor}.${patch}`
pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

try {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  lock.version = next
  if (lock.packages?.['']) lock.packages[''].version = next
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
} catch { /* sin lock o ilegible: no bloquea */ }

run(`git add package.json package-lock.json`)
run(`git commit -m "${next}"`)
run(`git tag v${next}`)
console.log(`version: ${m[0]} -> ${next} (tag v${next})`)

if (!noPush) {
  const branch = out('git branch --show-current') || 'master'
  run(`git push origin ${branch}`)
  run(`git push origin v${next}`)
} else {
  console.log('(--no-push: no se pusheo, hacelo vos)')
}

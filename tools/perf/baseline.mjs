#!/usr/bin/env node
/**
 * Baseline de performance — corre sin Electron.
 *
 * Mide (en este orden):
 *  1. Tamaños de bundle en out/ (renderer, main, preload, innerta).
 *  2. Conteo y tamaño de chunks del renderer.
 *  3. Grep de anti-patterns en el código (console.log/debugger sueltos,
 *     imports de barrel, módulos sin tree-shake).
 *
 * NO requiere correr la app: el bundle ya está en out/ tras
 * `npm run build`. Para mediciones de runtime usar el comando de
 * paleta "Diagnosticar arranque" o el IPC perf:getReport.
 *
 * Salida: JSON estable a .perf/baseline-<git-sha>-<timestamp>.json
 * Imprime resumen en stdout.
 *
 * Uso:
 *   node tools/perf/baseline.mjs           # baseline del build actual
 *   node tools/perf/baseline.mjs --runtime  # además lee .perf/runtime-*.json
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync as _read } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(__dirname, '../..')

function gitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch {
    return 'no-git'
  }
}

function fileSize(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function dirSize(dir) {
  if (!existsSync(dir)) return { bytes: 0, files: 0 }
  let bytes = 0
  let files = 0
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    const entries = readdirSync(cur, { withFileTypes: true })
    for (const e of entries) {
      const p = join(cur, e.name)
      if (e.isDirectory()) stack.push(p)
      else {
        bytes += statSync(p).size
        files++
      }
    }
  }
  return { bytes, files }
}

function listAssets(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => {
      const p = join(dir, name)
      return { name, bytes: statSync(p).size }
    })
    .sort((a, b) => b.bytes - a.bytes)
}

function measureRendererBundle() {
  const out = join(repoRoot, 'out/renderer')
  const assetsDir = join(out, 'assets')
  if (!existsSync(out)) {
    return { exists: false, chunks: [], totalJs: 0, totalCss: 0, totalBytes: 0 }
  }
  const all = listAssets(assetsDir)
  const js = all.filter((a) => a.name.endsWith('.js'))
  const css = all.filter((a) => a.name.endsWith('.css'))
  return {
    exists: true,
    chunks: all.slice(0, 30), // top 30 para no inflar el JSON
    jsCount: js.length,
    cssCount: css.length,
    totalJs: js.reduce((s, a) => s + a.bytes, 0),
    totalCss: css.reduce((s, a) => s + a.bytes, 0),
    totalBytes: all.reduce((s, a) => s + a.bytes, 0)
  }
}

function measureProcessBundle() {
  const main = dirSize(join(repoRoot, 'out/main'))
  const preload = dirSize(join(repoRoot, 'out/preload'))
  return { main, preload }
}

function measureInnerta() {
  const wasm = fileSize(join(repoRoot, 'src/renderer/public/innerta/innerta.wasm'))
  const glue = fileSize(join(repoRoot, 'src/renderer/public/innerta/innerta.js'))
  return { wasm, glue, total: wasm + glue }
}

function measureNodeModules() {
  return dirSize(join(repoRoot, 'node_modules'))
}

function antiPatterns() {
  /** @type {Record<string, string[]>} */
  const findings = {}
  function grep(pattern, glob) {
    try {
      const out = execSync(
        `grep -rn --include="${glob}" --exclude-dir=node_modules --exclude-dir=out --exclude-dir=.perf "${pattern}" src tools tests 2>/dev/null | head -50`,
        { cwd: repoRoot, encoding: 'utf8' }
      ).trim()
      return out ? out.split('\n') : []
    } catch {
      return []
    }
  }
  // console.log/debug sueltos en código de producto (los que estén detrás de PERF_FLAGS.logTiming no cuentan porque son llamados indirectos, pero aquí los enumeramos igual para revisión).
  findings['console.log_debug'] = grep('console\\.(log|debug)\\b', '*.{ts,tsx}')
  findings['debugger_statement'] = grep('\\bdebugger\\b', '*.{ts,tsx}')
  findings['TODO_perf'] = grep('//\\s*TODO.*perf', '*.{ts,tsx}')
  return findings
}

function readRuntime() {
  const dir = join(repoRoot, '.perf')
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('runtime-') && f.endsWith('.json'))
    .sort()
  if (files.length === 0) return null
  return JSON.parse(readFileSync(join(dir, files[files.length - 1]), 'utf8'))
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function main() {
  const args = new Set(process.argv.slice(2))
  const includeRuntime = args.has('--runtime')

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const sha = gitShortSha()

  const renderer = measureRendererBundle()
  const proc = measureProcessBundle()
  const innerta = measureInnerta()
  const nodeModules = measureNodeModules()
  const ap = antiPatterns()

  const report = {
    timestamp: ts,
    gitSha: sha,
    renderer,
    process: proc,
    innerta,
    nodeModules: { bytes: nodeModules.bytes, files: nodeModules.files },
    antiPatterns: {
      consoleLogDebug: ap.console_log_debug?.length ?? 0,
      debuggerStatements: ap.debugger_statement?.length ?? 0,
      todos: ap.TODO_perf?.length ?? 0
    },
    runtime: includeRuntime ? readRuntime() : null
  }

  const dir = join(repoRoot, '.perf')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const file = join(dir, `baseline-${sha}-${ts}.json`)
  writeFileSync(file, JSON.stringify(report, null, 2))

  // Resumen stdout.
  console.log(`baseline: ${file}`)
  console.log(`git:      ${sha}`)
  console.log(`renderer: ${renderer.chunks?.length ?? 0} assets, total ${fmt(renderer.totalBytes ?? 0)} (js ${fmt(renderer.totalJs ?? 0)}, css ${fmt(renderer.totalCss ?? 0)})`)
  console.log(`main:     ${fmt(proc.main.bytes)} (${proc.main.files} files)`)
  console.log(`preload:  ${fmt(proc.preload.bytes)} (${proc.preload.files} files)`)
  console.log(`innerta:  wasm ${fmt(innerta.wasm)}, glue ${fmt(innerta.glue)}`)
  console.log(`node_modules: ${fmt(nodeModules.bytes)} (${nodeModules.files} files)`)
  console.log(
    `anti-patterns: console.log/debug=${ap.console_log_debug?.length ?? 0}, debugger=${ap.debugger_statement?.length ?? 0}`
  )
}

main()

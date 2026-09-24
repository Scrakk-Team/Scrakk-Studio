// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Anuncios de la bienvenida = el changelog del repo, leído en build.
 *
 * Auto-descubre `docs/changelog/changelog-*.md` (publicar una versión = crear
 * el md, sin registrar nada) y usa la de versión más alta. De ese markdown se
 * separa la PRIMERA entrada (`## <versión> — <título>`) para mostrar:
 *
 *   - `version` + `title`: encabezado del anuncio.
 *   - `summary`: primer punto, para el estado colapsado.
 *   - `body`: la entrada completa (markdown), para el expandido.
 *
 * Nada de esto está hardcodeado: cambiar el `.md` cambia lo que se ve.
 */

import { isNewerVersion } from '@shared/version'

const modules = import.meta.glob('../../../../../../../docs/changelog/changelog-*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>

export interface WelcomeAnnouncement {
  version: string
  title: string
  summary: string
  body: string
}

/** `changelog-1.2.3.md` → `[1,2,3]`; null si el nombre no trae versión. */
export function versionFromPath(path: string): number[] | null {
  const m = /changelog-(\d+)\.(\d+)\.(\d+)\.md$/.exec(path)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Saca el marcado inline (`**negrita**`, backticks, links) para el resumen. */
function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Primera entrada del markdown (`## …` hasta el próximo `## …`).
 * El cuerpo se devuelve tal cual (sin el encabezado) para renderizarlo.
 */
export function parseLatestEntry(
  markdown: string
): { version: string; title: string; summary: string; body: string } | null {
  const lines = markdown.split(/\r?\n/)
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      if (start === -1) start = i
      else {
        end = i
        break
      }
    }
  }
  if (start === -1) return null

  const header = lines[start].replace(/^##\s+/, '').trim()
  const headerMatch = /^(\d+(?:\.\d+)*)\s*[—–-]\s*(.+)$/.exec(header)
  const version = headerMatch ? headerMatch[1] : ''
  const title = headerMatch ? headerMatch[2].trim() : header

  const bodyLines = lines.slice(start + 1, end)
  const body = bodyLines.join('\n').trim()

  let summary = ''
  for (const raw of bodyLines) {
    const line = raw.trim()
    if (!line || /^#{1,6}\s/.test(line)) continue
    summary = stripInline(line.replace(/^[-*+]\s*/, ''))
    if (summary) break
  }
  if (summary.length > 220) summary = `${summary.slice(0, 217).trimEnd()}…`

  return { version, title, summary, body }
}

/** La entrada más nueva entre los `changelog-*.md` (o null si no hay). */
export function loadAnnouncement(): WelcomeAnnouncement | null {
  let best: { version: number[]; raw: string } | null = null
  for (const [path, raw] of Object.entries(modules)) {
    const version = versionFromPath(path)
    if (!version) continue
    if (!best || compareVersions(version, best.version) > 0) {
      best = { version, raw }
    }
  }
  if (!best) return null

  const entry = parseLatestEntry(best.raw)
  if (!entry) return null
  return {
    version: entry.version || best.version.join('.'),
    title: entry.title,
    summary: entry.summary,
    body: entry.body
  }
}

// ── Novedades del changelog LOCAL ───────────────────────────────────────────
// Para que el badge de Anuncios funcione sin depender del release remoto.

const SEEN_KEY = 'welcome:seen-changelog'

/** Versión del changelog local ya vista ('' si nunca). */
export function readSeenChangelog(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Marca como vista la versión del changelog local. */
export function markChangelogSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // sin storage: se recalcula al reiniciar
  }
}

/**
 * ¿Hay novedad en el changelog LOCAL? (la versión del `changelog-x.x.x.md` más
 * nueva que la app y todavía sin ver).
 */
export function changelogHasNews(version: string, currentVersion: string): boolean {
  if (!version || !currentVersion) return false
  return isNewerVersion(version, currentVersion) && readSeenChangelog() !== version
}

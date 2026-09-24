#!/usr/bin/env node
/**
 * Bundle de documentación de Scrakk Studio.
 *
 * Fuente de verdad: `docs/**\/*.md` (Markdown con front-matter). Este script:
 *
 *   --init   → escribe el front-matter (title/group/order/summary) donde falte.
 *   --check  → valida front-matter + links internos (sale con código 1 si falla).
 *   (nada)   → construye `docs/.generated/`:
 *                index.json   · nav + metadata (sin cuerpos)
 *                docs.json    · bundle completo (con markdown + html)
 *                llms.txt     · todo el corpus en un solo texto para IAs
 *                index.html   · visor estático (SPA con hash routing)
 *                md/<slug>.md · copia cruda de cada doc
 *
 * El bundle lo consumen:
 *   - `docs.scrakk.art` (R2): visor humano + crudos.
 *   - `api.scrakk.art/api/docs` (Pages Function): web + IAs.
 *
 * Nada está hardcodeado: el front-matter manda. Agregar un `.md` = aparece solo.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DOCS = path.join(ROOT, 'docs')
const OUT = path.join(DOCS, '.generated')

/** Grupos de navegación (el `group:` del front-matter apunta a un id). */
const GROUPS = [
  { id: 'start', title: 'Empezar', order: 0 },
  { id: 'chat', title: 'Chat con IA', order: 10 },
  { id: 'editor', title: 'Editor', order: 20 },
  { id: 'extensions', title: 'Extensiones', order: 30 },
  { id: 'lsp', title: 'Language Server (LSP)', order: 40 },
  { id: 'changelog', title: 'Novedades', order: 90 }
]
const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]))

/** Carpetas que no se publican (migraciones SQL, artefactos). */
const EXCLUDE_DIRS = new Set(['backend', '.generated'])

// ── utilidades ────────────────────────────────────────────────────────────────

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function parseFrontmatter(raw) {
  const m = FM_RE.exec(raw)
  if (!m) return { data: {}, body: raw }
  const data = {}
  for (const line of m[1].split(/\r?\n/)) {
    const mm = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!mm) continue
    let v = mm[2].trim()
    if (v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    } else if (v.startsWith('[')) {
      try {
        v = JSON.parse(v)
      } catch {
        v = v
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    }
    data[mm[1]] = v
  }
  return { data, body: raw.slice(m[0].length) }
}

function yamlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function toPosix(p) {
  return p.split(path.sep).join('/')
}

/** `docs/…` → lista de rutas `.md` relativas a `docs/` (posix), ordenadas. */
function listDocs(dir = DOCS) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue
      out.push(...listDocs(full))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(toPosix(path.relative(DOCS, full)))
    }
  }
  return out.sort()
}

function slugFor(rel) {
  const noExt = rel.replace(/\/?\.md$/, '').replace(/\.md$/, '')
  if (noExt === 'README') return ''
  if (noExt.endsWith('/README')) return noExt.slice(0, -'/README'.length)
  return noExt
}

function groupFor(rel) {
  const parts = rel.split('/')
  if (parts.length === 1) return 'start'
  return GROUP_BY_ID[parts[0]] ? parts[0] : 'start'
}

function firstHeading(body) {
  const m = /^#\s+(.+?)\s*$/m.exec(body)
  return m ? m[1].trim() : ''
}

function firstParagraph(body) {
  const lines = body.split(/\r?\n/)
  let inCode = false
  const buf = []
  for (const raw of lines) {
    const line = raw.trim()
    if (/^```/.test(line)) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    if (!line) {
      if (buf.length) break
      continue
    }
    if (/^#{1,6}\s/.test(line)) continue
    if (/^[|>]/.test(line)) continue
    buf.push(line.replace(/^[-*+]\s*/, ''))
    if (buf.length >= 3) break
  }
  let text = buf.join(' ').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ').trim()
  if (text.length > 200) text = `${text.slice(0, 197).trimEnd()}…`
  return text
}

/** Encabezados `## …` fuera de bloques de código (para el TOC). */
function extractHeadings(body) {
  const out = []
  let inCode = false
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^```/.test(line)) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (m) out.push({ depth: m[1].length, text: m[2].replace(/[*`]/g, '') })
  }
  return out
}

function slugifyAnchor(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** rehype plugin: agrega `id` a los encabezados (anclas estilo GitHub). */
function rehypeHeadingIds() {
  return (tree) => {
    const textOf = (node) => {
      if (!node) return ''
      if (node.type === 'text') return node.value || ''
      return (node.children || []).map(textOf).join('')
    }
    const walk = (node) => {
      if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
        node.properties = node.properties || {}
        if (!node.properties.id) node.properties.id = slugifyAnchor(textOf(node))
      }
      for (const child of node.children || []) walk(child)
    }
    walk(tree)
  }
}

function renderHtml(markdown) {
  return renderToStaticMarkup(
    React.createElement(
      Markdown,
      { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHeadingIds] },
      markdown
    )
  )
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function readVersion() {
  if (process.env.DOCS_VERSION) return process.env.DOCS_VERSION
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function readRef() {
  if (process.env.DOCS_REF) return process.env.DOCS_REF
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

// ── init (front-matter) ───────────────────────────────────────────────────────

function runInit() {
  const files = listDocs()
  const entries = files.map((rel) => {
    const raw = fs.readFileSync(path.join(DOCS, rel), 'utf8')
    const { data, body } = parseFrontmatter(raw)
    return {
      rel,
      raw,
      body,
      hasFm: FM_RE.test(raw),
      title: data.title || firstHeading(body) || slugFor(rel) || 'Inicio',
      summary: data.summary || firstParagraph(body),
      group: data.group || groupFor(rel)
    }
  })

  // Asigna `order` determinístico por grupo (README/índice primero).
  const byGroup = {}
  for (const e of entries) (byGroup[e.group] ||= []).push(e)
  for (const list of Object.values(byGroup)) {
    list.sort((a, b) => {
      const aReadme = /(^|\/)README\.md$/.test(a.rel) ? 0 : 1
      const bReadme = /(^|\/)README\.md$/.test(b.rel) ? 0 : 1
      return aReadme - bReadme || a.rel.localeCompare(b.rel)
    })
    list.forEach((e, i) => {
      e.order = (i + 1) * 10
    })
  }

  let written = 0
  for (const e of entries) {
    if (e.hasFm && !process.argv.includes('--force')) continue
    const fm = [
      '---',
      `title: ${yamlString(e.title)}`,
      `group: ${e.group}`,
      `order: ${e.order}`,
      `summary: ${yamlString(e.summary)}`,
      '---',
      ''
    ].join('\n')
    fs.writeFileSync(path.join(DOCS, e.rel), `${fm}${e.body.replace(/^\s*\n/, '')}`, 'utf8')
    written += 1
  }
  console.log(`front-matter: ${written} archivo(s) escritos, ${entries.length} docs`)
}

// ── check ─────────────────────────────────────────────────────────────────────

function runCheck() {
  const files = listDocs()
  const slugs = new Set(files.map(slugFor))
  const problems = []
  for (const rel of files) {
    const raw = fs.readFileSync(path.join(DOCS, rel), 'utf8')
    if (!FM_RE.test(raw)) problems.push(`${rel}: falta front-matter`)
    const { body } = parseFrontmatter(raw)
    // Links internos relativos a otros .md
    const linkRe = /\]\(([^)]+\.md)(#[^)]*)?\)/g
    let m
    while ((m = linkRe.exec(body))) {
      const target = m[1]
      if (/^[a-z]+:\/\//i.test(target)) continue
      const baseDir = path.posix.dirname(rel)
      const resolved = path.posix.normalize(path.posix.join(baseDir, target))
      if (!slugs.has(slugFor(resolved))) problems.push(`${rel}: link roto → ${target}`)
    }
  }
  if (problems.length) {
    console.error(`✗ docs check: ${problems.length} problema(s)`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log(`✓ docs check: ${files.length} docs OK`)
}

// ── build ─────────────────────────────────────────────────────────────────────

function buildEntry(rel) {
  const raw = fs.readFileSync(path.join(DOCS, rel), 'utf8')
  const { data, body } = parseFrontmatter(raw)
  const slug = slugFor(rel)
  const group = data.group || groupFor(rel)
  return {
    slug,
    rel,
    group,
    order: Number(data.order) || 0,
    title: data.title || firstHeading(body) || slug || 'Inicio',
    summary: data.summary || firstParagraph(body),
    related: Array.isArray(data.related) ? data.related : [],
    markdown: body.trim(),
    html: renderHtml(body),
    headings: extractHeadings(body),
    source: `https://github.com/Scrakk/Scrakk-Studio/blob/master/docs/${rel}`
  }
}

function navOf(docs) {
  return GROUPS.filter((g) => docs.some((d) => d.group === g.id))
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      id: g.id,
      title: g.title,
      order: g.order,
      items: docs
        .filter((d) => d.group === g.id)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
        .map((d) => ({ slug: d.slug, title: d.title, summary: d.summary, order: d.order, rel: d.rel }))
    }))
}

function renderViewer({ version, ref, groups, docs }) {
  const nav = groups
    .map(
      (g) => `<div class="group"><div class="group-title">${escapeHtml(g.title)}</div>${g.items
        .map(
          (it) =>
            `<a class="item" href="#${it.slug || '/'}" data-slug="${it.slug || ''}">${escapeHtml(it.title)}</a>`
        )
        .join('')}</div>`
    )
    .join('')

  const sections = docs
    .map(
      (d) => `<article class="doc" id="doc-${d.slug || 'index'}" data-slug="${d.slug}" hidden>
<div class="doc-meta">${escapeHtml(d.rel)} · v${escapeHtml(version)}</div>
${d.html}
<a class="source" href="${d.source}" target="_blank" rel="noopener">Editar en GitHub →</a>
</article>`
    )
    .join('\n')

  const meta = docs.map((d) => ({ slug: d.slug, title: d.title, rel: d.rel }))
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Scrakk Studio — Documentación</title>
<meta name="description" content="Documentación oficial de Scrakk Studio (IDE agéntico). v${escapeHtml(version)}." />
<style>
:root{--bg:#0b0d10;--surface:#12151a;--border:#232830;--text:#e6e9ef;--muted:#98a2b3;--accent:#7c9cff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.layout{display:flex;min-height:100vh}
aside{width:290px;flex:none;border-right:1px solid var(--border);background:var(--surface);padding:20px 16px;position:sticky;top:0;height:100vh;overflow:auto}
.brand{font-weight:700;letter-spacing:-.02em;font-size:16px;margin-bottom:4px}
.ver{color:var(--muted);font-size:12px;margin-bottom:16px}
.search{width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);margin-bottom:16px}
.group{margin-bottom:18px}
.group-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px}
.item{display:block;padding:5px 8px;border-radius:6px;color:var(--text);font-size:14px}
.item:hover{background:#1a1f27;text-decoration:none}
.item.active{background:#1e2733;color:#fff}
main{flex:1;min-width:0;padding:40px 48px;max-width:900px}
.doc-meta{color:var(--muted);font-size:12px;margin-bottom:20px}
.doc h1{font-size:30px;letter-spacing:-.02em;margin-top:0}
.doc h2{font-size:22px;margin-top:36px;border-bottom:1px solid var(--border);padding-bottom:6px}
.doc h3{font-size:17px;margin-top:26px}
.doc code{background:#1a1f27;padding:2px 5px;border-radius:4px;font-size:.88em}
.doc pre{background:#12151a;border:1px solid var(--border);border-radius:8px;padding:14px 16px;overflow:auto}
.doc pre code{background:none;padding:0}
.doc table{border-collapse:collapse;width:100%;margin:14px 0}
.doc th,.doc td{border:1px solid var(--border);padding:6px 10px;text-align:left;font-size:14px}
.doc th{background:var(--surface)}
.doc blockquote{border-left:3px solid var(--border);margin:0;padding-left:14px;color:var(--muted)}
.source{display:inline-block;margin-top:32px;font-size:13px;color:var(--muted)}
@media(max-width:820px){.layout{flex-direction:column}aside{width:100%;height:auto;position:static}main{padding:24px}}
</style>
</head>
<body>
<div class="layout">
<aside>
<div class="brand">Scrakk Studio — Docs</div>
<div class="ver">v${escapeHtml(version)}${ref ? ` · ${escapeHtml(ref)}` : ''}</div>
<input class="search" id="q" placeholder="Buscar…" autocomplete="off" />
<nav id="nav">${nav}</nav>
</aside>
<main id="content">
${sections}
</main>
</div>
<script>
const META=${JSON.stringify(meta)};
const docs=[...document.querySelectorAll('.doc')];
const items=[...document.querySelectorAll('.item')];
function show(slug){
  let found=false;
  for(const d of docs){const on=d.dataset.slug===slug;d.hidden=!on;if(on)found=true}
  if(!found&&docs[0])docs[0].hidden=false;
  for(const it of items)it.classList.toggle('active',it.dataset.slug===slug);
  window.scrollTo(0,0);
}
function fromHash(){const h=decodeURIComponent(location.hash.replace(/^#/,'')||'');show(h)}
window.addEventListener('hashchange',fromHash);
document.getElementById('q').addEventListener('input',(e)=>{
  const q=e.target.value.toLowerCase().trim();
  for(const it of items){const m=META.find(x=>x.slug===it.dataset.slug)||{};const hay=(m.title+' '+(m.rel||'')).toLowerCase();it.style.display=!q||hay.includes(q)?'':'none'}
});
fromHash();
</script>
</body>
</html>`
}

function runBuild() {
  const version = readVersion()
  const ref = readRef()
  const files = listDocs()
  const docs = files.map(buildEntry)
  const groups = navOf(docs)

  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(path.join(OUT, 'md'), { recursive: true })

  const index = { version, ref, generatedFrom: ref, groups }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2))
  fs.writeFileSync(
    path.join(OUT, 'docs.json'),
    JSON.stringify({ version, ref, groups, docs }, null, 2)
  )

  // llms.txt — corpus completo en texto plano.
  const llms = [
    '# Scrakk Studio — Documentación',
    `> IDE agéntico de Scrakk. Versión ${version}${ref ? ` (${ref})` : ''}. Fuente: github.com/Scrakk/Scrakk-Studio`,
    ''
  ]
  for (const g of groups) {
    llms.push(`## ${g.title}`, '')
    for (const it of g.items) llms.push(`- [${it.title}](https://docs.scrakk.art/#${it.slug}): ${it.summary}`)
    llms.push('')
  }
  llms.push('---', '', '## Documentos completos', '')
  for (const d of docs) llms.push(`### ${d.title} (${d.slug || 'index'})`, '', d.markdown, '')
  fs.writeFileSync(path.join(OUT, 'llms.txt'), llms.join('\n'))

  for (const d of docs) {
    const name = d.slug ? `${d.slug}.md` : 'index.md'
    const dest = path.join(OUT, 'md', name)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, `# ${d.title}\n\n${d.markdown}\n`)
  }

  // Un JSON por doc (lo sirve api.scrakk.art/api/docs/<slug> sin cargar todo).
  for (const d of docs) {
    const name = d.slug ? `${d.slug}.json` : 'index.json'
    const dest = path.join(OUT, 'doc', name)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, JSON.stringify(d, null, 2))
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), renderViewer({ version, ref, groups, docs }))

  const bytes = docs.reduce((n, d) => n + d.markdown.length, 0)
  console.log(`✓ docs build: ${docs.length} docs · ${groups.length} grupos · ${(bytes / 1024).toFixed(0)} KB de markdown → ${toPosix(path.relative(ROOT, OUT))}/`)
}

// ── main ──────────────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  if (process.argv.includes('--init')) runInit()
  else if (process.argv.includes('--check')) runCheck()
  else runBuild()
}

export {
  parseFrontmatter,
  slugFor,
  groupFor,
  firstHeading,
  firstParagraph,
  extractHeadings,
  slugifyAnchor,
  navOf,
  yamlString
}

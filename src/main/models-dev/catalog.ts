/**
 * Catálogo de modelos (proceso main).
 *
 * Fuente: https://models.dev/api.json (MIT). Hace el fetch sin CORS, parsea la
 * estructura completa (`{ providerId: { id, name, api, doc, npm, models } }`),
 * proyecta lo que la UI necesita y cachea en disco para arranque instantáneo y
 * funcionamiento offline. En cada apertura del editor se dispara `refresh()`.
 */

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { CatalogProviderConfig, ModelsDevCatalog } from '@shared/modelsDev'

const CATALOG_URL = 'https://models.dev/api.json'
const LOGO_BASE = 'https://models.dev/logos'

/**
 * Endpoints OpenAI-compatible de proveedores que en models.dev no traen `api`
 * (usan su SDK propio). Es una lista CORTA de URLs base, no el catálogo: el
 * resto de los proveedores sale entero del JSON.
 */
const BASE_URL_OVERRIDES: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  cohere: 'https://api.cohere.ai/compatibility/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  togetherai: 'https://api.together.xyz/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  venice: 'https://api.venice.ai/api/v1',
  perplexity: 'https://api.perplexity.ai',
  aihubmix: 'https://aihubmix.com/v1',
  vercel: 'https://ai-gateway.vercel.sh/v1',
  v0: 'https://api.v0.dev/v1'
}

/** Headers extra por proveedor (los que el endpoint exige/estima). */
const PROVIDER_HEADERS: Record<string, Record<string, string>> = {
  openrouter: { 'HTTP-Referer': 'https://scrakk.art', 'X-Title': 'Scrakk Studio' }
}

interface RawModel {
  id?: string
  name?: string
  release_date?: string
  tool_call?: boolean
  reasoning?: boolean
  reasoning_options?: Array<{ type?: string; values?: string[] }>
  modalities?: { output?: string[] }
}

interface RawProvider {
  id?: string
  name?: string
  api?: string
  doc?: string
  npm?: string
  env?: string[]
  models?: Record<string, RawModel>
}

let current: ModelsDevCatalog | null = null
let inflight: Promise<ModelsDevCatalog | null> | null = null

function cachePath(): string {
  return path.join(app.getPath('userData'), 'models.dev.json')
}

function isTextModel(model: RawModel): boolean {
  const output = model.modalities?.output
  if (Array.isArray(output)) return output.includes('text')
  // Sin modalities: se asume de texto (los modelos de imagen/audio lo declaran).
  return true
}

/** Elige el modelo sugerido: el más nuevo con tool_call; si no, el más nuevo. */
function pickDefaultModel(models: Record<string, RawModel>, ids: string[]): string {
  const ranked = [...ids].sort((a, b) => {
    const ra = models[a]?.release_date ?? ''
    const rb = models[b]?.release_date ?? ''
    return rb.localeCompare(ra)
  })
  const withTools = ranked.find((id) => models[id]?.tool_call)
  return withTools ?? ranked[0] ?? ''
}

/** Variantes de razonamiento por modelo (solo los que las declaran). */
function projectReasoning(
  models: Record<string, RawModel>,
  ids: string[]
): Record<string, { toggle?: boolean; effort?: string[] }> | undefined {
  const out: Record<string, { toggle?: boolean; effort?: string[] }> = {}
  for (const id of ids) {
    const model = models[id]
    if (!model?.reasoning) continue
    const options = Array.isArray(model.reasoning_options) ? model.reasoning_options : []
    const toggle = options.some((option) => option?.type === 'toggle')
    const effort = options.find((option) => option?.type === 'effort')?.values
    const values = Array.isArray(effort) ? effort.filter((v): v is string => typeof v === 'string') : []
    if (toggle || values.length > 0) {
      out[id] = { ...(toggle ? { toggle: true } : {}), ...(values.length > 0 ? { effort: values } : {}) }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Proyecta el JSON crudo de models.dev a la lista que consume la app. */
export function projectCatalog(raw: Record<string, RawProvider>): CatalogProviderConfig[] {
  const out: CatalogProviderConfig[] = []
  for (const [id, provider] of Object.entries(raw)) {
    if (!provider || typeof provider !== 'object') continue
    const baseUrl = (provider.api ?? BASE_URL_OVERRIDES[id] ?? '').trim()
    if (!baseUrl) continue
    const rawModels = provider.models ?? {}
    const ids = Object.keys(rawModels)
      .filter((modelId) => isTextModel(rawModels[modelId]))
      .sort()
    out.push({
      id,
      name: provider.name ?? id,
      description: provider.npm ? `OpenAI-compatible · ${provider.npm}` : 'OpenAI-compatible',
      baseUrl,
      apiKeyUrl: provider.doc ?? '',
      defaultModel: pickDefaultModel(rawModels, ids),
      models: ids,
      reasoning: projectReasoning(rawModels, ids),
      logo: `${LOGO_BASE}/${id}.svg`,
      headers: PROVIDER_HEADERS[id]
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function readDisk(): Promise<ModelsDevCatalog | null> {
  try {
    const raw = await fs.readFile(cachePath(), 'utf-8')
    const parsed = JSON.parse(raw) as ModelsDevCatalog
    if (!parsed || !Array.isArray(parsed.providers)) return null
    return parsed
  } catch {
    return null
  }
}

async function writeDisk(catalog: ModelsDevCatalog): Promise<void> {
  try {
    await fs.writeFile(cachePath(), JSON.stringify(catalog), 'utf-8')
  } catch {
    // Sin cache en disco: se sigue con memoria.
  }
}

async function fetchRemote(): Promise<ModelsDevCatalog | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(CATALOG_URL, { signal: controller.signal })
    if (!response.ok) return null
    const raw = (await response.json()) as Record<string, RawProvider>
    const catalog: ModelsDevCatalog = { fetchedAt: Date.now(), providers: projectCatalog(raw) }
    if (catalog.providers.length === 0) return null
    current = catalog
    await writeDisk(catalog)
    return catalog
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Catálogo actual: memoria → disco. No fuerza red. */
export async function getCatalog(): Promise<ModelsDevCatalog | null> {
  if (current) return current
  const disk = await readDisk()
  if (disk) current = disk
  return current
}

/** Fuerza un fetch remoto (lo usa el arranque del editor). */
export async function refreshCatalog(): Promise<ModelsDevCatalog | null> {
  if (inflight) return inflight
  inflight = fetchRemote().finally(() => {
    inflight = null
  })
  const result = await inflight
  return result ?? (await getCatalog())
}

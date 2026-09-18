/**
 * Consejos del WelcomePanel — definiciones JSON auto-descubiertas.
 *
 * Agregar un consejo = crear `tips/<id>.json`, sin registrar nada:
 * el glob los levanta solos. Estructura por consejo:
 * `{ "id": string, "title": string, "description": string, "order"?: number }`.
 * El parser es tolerante (igual que los schemas SEF): lo inválido se
 * descarta con warning y el panel sigue con el resto.
 */

export interface TipDef {
  id: string
  title: string
  description: string
  order?: number
}

/** Valida UNA definición cruda (objeto ya parseado). Null si inválida. */
export function parseTipDefinition(raw: unknown, source: string): TipDef | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`[welcome/tips] definición inválida en ${source}: no es objeto`)
    return null
  }
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id.trim()) {
    console.warn(`[welcome/tips] consejo sin id válido en ${source}, se descarta`)
    return null
  }
  if (typeof r.title !== 'string' || !r.title.trim()) {
    console.warn(`[welcome/tips] consejo "${r.id}" sin title válido en ${source}, se descarta`)
    return null
  }
  if (typeof r.description !== 'string' || !r.description.trim()) {
    console.warn(`[welcome/tips] consejo "${r.id}" sin description válida en ${source}, se descarta`)
    return null
  }
  const tip: TipDef = {
    id: r.id.trim(),
    title: r.title.trim(),
    description: r.description.trim()
  }
  if (typeof r.order === 'number' && Number.isFinite(r.order)) {
    tip.order = r.order
  }
  return tip
}

const tipModules = import.meta.glob<{ default: unknown }>('./tips/*.json', { eager: true })

/** Todos los consejos válidos, ordenados por `order` (luego id estable). */
export function loadTips(): TipDef[] {
  const out: TipDef[] = []
  const seen = new Set<string>()
  for (const [path, module] of Object.entries(tipModules)) {
    const tip = parseTipDefinition(module.default, path)
    if (!tip) continue
    if (seen.has(tip.id)) {
      console.warn(`[welcome/tips] id duplicado "${tip.id}" en ${path}, se descarta`)
      continue
    }
    seen.add(tip.id)
    out.push(tip)
  }
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
}

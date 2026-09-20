/**
 * Registry de skills de Scrakk — estándar Agent Skills (carpeta + SKILL.md).
 *
 * Fuentes:
 *  - proyecto: `<root>/.scrakk/skills/<name>/SKILL.md`
 *  - usuario:  `~/.scrakk/skills/<name>/SKILL.md`
 *  - extensión (SEF): el paquete aporta `skills/<name>/SKILL.md` y las
 *    registra vía este registry (mismo `subscribe`, misma API).
 *
 * El proyecto gana sobre el usuario por nombre. Cualquier subsistema escucha
 * `subscribe` para reaccionar (panel de librería, tool `list_skills`, settings).
 */

import { parseSkillFile } from './frontmatter'
import { onScrakkChanged, scrakkHandle, type ScrakkHandle } from '../scrakk'

export type SkillSource = 'project' | 'user' | 'extension'

export interface SkillInfo {
  /** Nombre único (frontmatter `name` o nombre de carpeta). */
  name: string
  description: string
  source: SkillSource
  /** Ruta dentro de su raíz (o del paquete, en extensiones). */
  path: string
  /** Id de la extensión dueña (solo source='extension'). */
  extensionId?: string
  license?: string
  compatibility?: string
}

export interface SkillContent extends SkillInfo {
  body: string
}

interface ExtensionSkill {
  info: SkillInfo
  loadBody: () => Promise<string | null>
}

const SETTINGS_KEY = 'scrakk-studio:skill-settings'

function loadDisabled(): Set<string> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as { disabled?: unknown }
    return new Set(Array.isArray(parsed.disabled) ? (parsed.disabled as string[]) : [])
  } catch {
    return new Set()
  }
}

class SkillRegistryClass {
  private skills = new Map<string, SkillInfo>()
  private files = new Map<string, { handle: ScrakkHandle; relative: string }>()
  private extensionSkills = new Map<string, ExtensionSkill>()
  private disabled = loadDisabled()
  private listeners = new Set<() => void>()
  private started = false
  private watching = false
  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }

  /** Arranca el descubrimiento y los watchers (idempotente). */
  start(): void {
    if (this.started) return
    this.started = true
    void this.refresh()
    this.watch()
    onScrakkChanged((event) => {
      if (event.relative === '' || event.relative.startsWith('skills')) this.scheduleRefresh()
    })
  }

  private watch(): void {
    if (this.watching) return
    this.watching = true
    for (const scope of ['project', 'user'] as const) {
      void scrakkHandle(scope, 'skills').watch('')
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => void this.refresh(), 150)
  }

  /** Re-escanea `.scrakk/skills` en ambas capas. */
  async refresh(): Promise<void> {
    const found = new Map<string, SkillInfo>()
    const files = new Map<string, { handle: ScrakkHandle; relative: string }>()

    // Usuario primero; el proyecto pisa por nombre.
    for (const scope of ['user', 'project'] as const) {
      const handle = scrakkHandle(scope, 'skills')
      const listed = await handle.list('')
      if (!listed.ok) continue
      for (const entry of listed.data) {
        if (entry.type !== 'dir') continue
        const relative = `${entry.name}/SKILL.md`
        const raw = await handle.read(relative)
        if (!raw.ok || raw.data === null) continue
        const parsed = parseSkillFile(raw.data)
        const name = (parsed.frontmatter.name ?? entry.name).trim()
        if (!name) continue
        found.set(name, {
          name,
          description: (parsed.frontmatter.description ?? '').trim(),
          source: scope,
          path: relative,
          license: parsed.frontmatter.license,
          compatibility: parsed.frontmatter.compatibility
        })
        files.set(name, { handle, relative })
      }
    }

    // Extensiones pisan al final (están instaladas explícitamente).
    for (const skill of this.extensionSkills.values()) found.set(skill.info.name, skill.info)

    this.skills = found
    this.files = files
    this.emit()
  }

  list(): SkillInfo[] {
    return [...this.skills.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Skills habilitadas (las que se ofrecen al modelo). */
  listEnabled(): SkillInfo[] {
    return this.list().filter((skill) => this.isEnabled(skill.name))
  }

  get(name: string): SkillInfo | undefined {
    return this.skills.get(name)
  }

  /** Carga el cuerpo de una skill (SKILL.md). */
  async load(name: string): Promise<SkillContent | null> {
    const info = this.skills.get(name)
    if (!info) return null
    if (info.source === 'extension') {
      const extension = this.extensionSkills.get(name)
      const body = (await extension?.loadBody()) ?? null
      if (body === null) return null
      return { ...info, body: parseSkillFile(body).body }
    }
    const file = this.files.get(name)
    if (!file) return null
    const raw = await file.handle.read(file.relative)
    if (!raw.ok || raw.data === null) return null
    return { ...info, body: parseSkillFile(raw.data).body }
  }

  // ── Preferencias (habilitada / deshabilitada) ────────────────────────────

  isEnabled(name: string): boolean {
    return !this.disabled.has(name)
  }

  setEnabled(name: string, enabled: boolean): void {
    if (enabled) this.disabled.delete(name)
    else this.disabled.add(name)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ disabled: [...this.disabled] }))
    } catch {
      // Sin storage: se mantiene en memoria.
    }
    this.emit()
  }

  // ── Contribución desde extensiones ───────────────────────────────────────

  registerExtensionSkill(extensionId: string, info: Omit<SkillInfo, 'source' | 'extensionId'>, loadBody: () => Promise<string | null>): void {
    this.extensionSkills.set(info.name, {
      info: { ...info, source: 'extension', extensionId },
      loadBody
    })
    void this.refresh()
  }

  unregisterExtension(extensionId: string): void {
    let changed = false
    for (const [name, skill] of this.extensionSkills) {
      if (skill.info.extensionId === extensionId) {
        this.extensionSkills.delete(name)
        changed = true
      }
    }
    if (changed) void this.refresh()
  }
}

export const skillRegistry = new SkillRegistryClass()

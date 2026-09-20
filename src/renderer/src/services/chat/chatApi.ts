/**
 * API pública del chat para que CUALQUIER subsistema inserte contenido.
 *
 * La usan, por ejemplo, una extensión que muestra una librería de skills
 * (click → `insertSkillIntoChat`) o cualquier panel que quiera mandar texto.
 * El panel activo escucha el evento `chat:insert` y lo agrega como mensaje del
 * usuario, así el modelo lo recibe en el turno siguiente.
 */

import { skillRegistry } from '@services/skills'

export type ChatInsertKind = 'skill' | 'text'

export interface ChatInsertPayload {
  kind: ChatInsertKind
  /** Contenido a insertar. */
  text: string
  /** Nombre de la skill (solo kind='skill'). */
  name?: string
}

/** Inserta contenido en el chat activo (evento global). */
export function insertIntoChat(payload: ChatInsertPayload): void {
  window.dispatchEvent(new CustomEvent('chat:insert', { detail: payload }))
}

/** Carga una skill y la inserta en el chat activo. */
export async function insertSkillIntoChat(name: string): Promise<{ ok: boolean; error?: string }> {
  const content = await skillRegistry.load(name)
  if (!content) return { ok: false, error: `Skill "${name}" no encontrada` }
  insertIntoChat({ kind: 'skill', name, text: content.body })
  return { ok: true }
}

/** Lista las skills disponibles (mismo registry que consumen las tools). */
export function listChatSkills(): ReturnType<typeof skillRegistry.list> {
  return skillRegistry.list()
}

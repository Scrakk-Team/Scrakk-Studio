/**
 * Chat context builder — builds the message array for API calls.
 *
 * Prefija el system prompt (con las tools del registry y su guía de uso) y
 * arma los mensajes a partir del historial de la sesión.
 */

import type { LlmChatMessage } from '@shared/llm'
import { buildSystemPrompt } from './prompts/systemPrompt'

/**
 * Devuelve los mensajes de sistema a prefijar en el request de chat.
 * Hoy es solo el system prompt; puede crecer (contexto de archivos, etc.).
 */
export function buildSystemMessages(): LlmChatMessage[] {
  return [{ role: 'system', content: buildSystemPrompt() }]
}

/**
 * Build the messages array for an API call from the session history.
 * system prompt → historial → mensaje del usuario.
 */
export function buildMessagesForApi(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userContent: string
): LlmChatMessage[] {
  return [
    ...buildSystemMessages(),
    ...history.map((message) => ({
      role: message.role as LlmChatMessage['role'],
      content: message.content
    })),
    { role: 'user', content: userContent }
  ]
}

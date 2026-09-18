/**
 * Exportación de chats: formato con separadores, toggle de tools,
 * truncado de resultados y nombre de archivo seguro.
 */

import { describe, it, expect } from 'vitest'
import {
  buildChatExport,
  exportFileName
} from '../src/renderer/src/features/chat/components/ChatExport/exportChat'
import type { ChatSession } from '../src/renderer/src/features/chat/state/ChatSessionsContext'

function sessionWith(messages: ChatSession['messages']): Pick<ChatSession, 'messages'> {
  return { messages }
}

const USER = { id: 'u1', role: 'user', content: 'hola', timestamp: 1 } as const
const AI = { id: 'a1', role: 'assistant', content: 'buenas', timestamp: 2 } as const

describe('buildChatExport', () => {
  it('separa usuario e IA con ---', () => {
    const text = buildChatExport(sessionWith([USER, AI] as never), { includeTools: true })
    expect(text).toBe('Usuario:\nhola\n\n---\n\nAsistente:\nbuenas')
  })

  it('incluye tools con nombre, arg y resultado', () => {
    const msg = {
      id: 'a2',
      role: 'assistant',
      content: 'listo',
      timestamp: 3,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/x.ts"}' } }
      ],
      tool_results: { c1: { content: 'contenido', success: true } }
    } as never
    const text = buildChatExport(sessionWith([msg]), { includeTools: true })
    expect(text).toContain('[Herramienta `read_file` /x.ts]')
    expect(text).toContain('contenido')
  })

  it('sin tools no muestra nada de herramientas', () => {
    const msg = {
      id: 'a2',
      role: 'assistant',
      content: 'listo',
      timestamp: 3,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/x.ts"}' } }
      ],
      tool_results: { c1: { content: 'contenido', success: true } }
    } as never
    const text = buildChatExport(sessionWith([msg]), { includeTools: false })
    expect(text).not.toContain('Herramienta')
    expect(text).not.toContain('contenido')
    expect(text).toContain('Asistente:\nlisto')
  })

  it('omite mensajes vacíos sin tools', () => {
    const empty = { id: 'a3', role: 'assistant', content: '', timestamp: 4 } as never
    const text = buildChatExport(sessionWith([USER, empty]), { includeTools: true })
    expect(text).toBe('Usuario:\nhola')
  })

  it('trunca resultados gigantes con marca', () => {
    const big = 'x'.repeat(5000)
    const msg = {
      id: 'a4',
      role: 'assistant',
      content: '',
      timestamp: 5,
      tool_calls: [
        { id: 'c9', type: 'function', function: { name: 'read_file', arguments: '{}' } }
      ],
      tool_results: { c9: { content: big, success: true } }
    } as never
    const text = buildChatExport(sessionWith([msg]), { includeTools: true })
    expect(text.length).toBeLessThan(5000)
    expect(text).toContain('truncado')
  })
})

describe('exportFileName', () => {
  it('slugifica el título y respeta la extensión', () => {
    expect(exportFileName('Mi Chat: dudas/fixes?', 'md')).toBe('mi-chat-dudas-fixes.md')
    expect(exportFileName('Mi Chat', 'txt')).toBe('mi-chat.txt')
  })

  it('título vacío o raro usa chat', () => {
    expect(exportFileName('!!!', 'txt')).toBe('chat.txt')
    expect(exportFileName('', 'md')).toBe('chat.md')
  })
})

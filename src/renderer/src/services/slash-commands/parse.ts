/**
 * Parseo de entradas de comando: `/nombre arg1 "arg dos" …`.
 *
 * Sin dependencias: el primer token (tras la barra) es el nombre y el resto se
 * separa por espacios, respetando comillas simples o dobles.
 */

export interface ParsedSlashCommand {
  name: string
  args: string[]
  rawArgs: string
}

/** True si el texto arranca con `/` (ignorando espacios iniciales). */
export function isSlashInput(text: string): boolean {
  return text.trimStart().startsWith('/')
}

/** Separa argumentos respetando comillas simples/dobles. */
function splitArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) args.push(current)
  return args
}

/** Parsea `/variants low` → `{ name:'variants', args:['low'], rawArgs:'low' }`. */
export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const body = trimmed.slice(1)
  const match = /^(\S+)\s*([\s\S]*)$/.exec(body)
  if (!match) return null
  const name = match[1].toLowerCase()
  if (!name) return null
  const rawArgs = (match[2] ?? '').trim()
  return { name, args: splitArgs(rawArgs), rawArgs }
}

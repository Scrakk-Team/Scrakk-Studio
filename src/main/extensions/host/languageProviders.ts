/**
 * Proveedores de lenguaje — registro REAL y consulta desde el IDE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES LA MITAD QUE FALTABA
 *
 * En VS Code un language server NO es un contribution point: es código. La
 * extensión hace `new LanguageClient(...)` y la lib (`vscode-languageclient`)
 * responde los requests del editor registrando PROVEEDORES en el API de
 * `vscode`: `languages.registerHoverProvider(selector, provider)`. Lo mismo
 * hace una extensión que aporta todo sin server (un linter que calcula en
 * memoria).
 *
 * Con los proveedores inertes (lo que había), esa cadena se cortaba en el
 * medio: el server arrancaba, recibía `didOpen`… y NADIE le preguntaba nada.
 * Aquí se registran de verdad y el IDE los consulta (`provider/query`), así que
 * el hover, el "ir a la definición", las referencias y el formateo del server
 * de una extensión llegan al editor.
 *
 * La DECISIÓN (a qué provider le toca, cómo se serializa) vive aquí; el
 * transporte y el ruteo entre hosts, en `providerBridge` del main (una
 * extensión = un host, y el IDE junta las respuestas de todos).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LO QUE TODAVÍA NO SE CONSULTA
 *
 * Completions, signatura, acciones de código, code lens, links, plegado,
 * tokens semánticos, inlay hints y las jerarquías siguen registrándose inertes:
 * el editor no tiene UI para ellos (el autocompletado del canvas de Innerta es
 * otro trabajo). Se registran sin romper el `activate`, y su aviso dice
 * exactamente eso — nunca un no-op silencioso.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Igual que el resto del host: cero Node, cero Electron, cero stdio. Habla
 * documentos y proveedores; si Owear cambia el runtime, esto se conserva.
 */

import { Disposable } from './vscodeShim'
import { Position, Range, type TextDocumentImpl } from './textDocuments'
import type { DocumentSelectorLike, MatchableDocument } from './vscodeApi'
import type {
  LanguageProviderKind,
  LogPayload,
  ProviderPosition,
  ProviderRange
} from '@shared/extensionHost/protocol'

/** Los tipos consultables viven en el protocolo (`LanguageProviderKind`). */

/** Tokens de cancelación que el proveedor recibe (nunca cancelados: sin UI). */
export interface CancellationTokenLike {
  isCancellationRequested: boolean
  onCancellationRequested: (listener: () => void) => Disposable
}

export function neverCancelledToken(): CancellationTokenLike {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => new Disposable(() => undefined)
  }
}

/** Un proveedor tal como lo registró la extensión (forma del API de VS Code). */
type ProviderLike = Record<string, unknown>

interface Registration {
  kind: LanguageProviderKind
  selector: DocumentSelectorLike
  provider: ProviderLike
}

export interface ProviderQueryInput {
  kind: LanguageProviderKind
  document: TextDocumentImpl
  position?: ProviderPosition
  range?: ProviderRange
  /** `references`: `{ includeDeclaration }` (el contexto del API de VS Code). */
  context?: { includeDeclaration?: boolean }
  /** `formatting`: opciones de formato (`tabSize`, `insertSpaces`). */
  options?: { tabSize?: number; insertSpaces?: boolean }
}

export interface ProviderQueryResult {
  /** `false` cuando ningún proveedor registrado atiende a este documento. */
  matched: boolean
  /** Resultado ya serializado para la UI (forma del LSP), o `null`. */
  result: unknown
}

export interface LanguageProviderOptions {
  /** `languages.match` del shim (se inyecta para no depender de vscodeApi). */
  match: (selector: DocumentSelectorLike, document: MatchableDocument) => number
  log: (level: LogPayload['level'], message: string) => void
}

export class LanguageProviderRegistry {
  private readonly registrations: Registration[] = []

  constructor(private readonly options: LanguageProviderOptions) {}

  /** `languages.registerXProvider(selector, provider)` → disposable real. */
  register(kind: LanguageProviderKind, selector: DocumentSelectorLike, provider: unknown): Disposable {
    if (!selector) {
      this.options.log('warn', `register${kind}Provider sin selector: el proveedor nunca se consultaría`)
      return new Disposable(() => undefined)
    }
    const registration: Registration = { kind, selector, provider: provider as ProviderLike }
    this.registrations.push(registration)
    return new Disposable(() => {
      const at = this.registrations.indexOf(registration)
      if (at !== -1) this.registrations.splice(at, 1)
    })
  }

  /** Cantidad registrada por tipo (diagnóstico: sale en el estado del host). */
  counts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const registration of this.registrations) {
      out[registration.kind] = (out[registration.kind] ?? 0) + 1
    }
    return out
  }

  /**
   * Consulta el primer proveedor que atiende el documento.
   *
   * Un host = UNA extensión, así que "el primero" es, en la práctica, el suyo.
   * El que junta las respuestas de VARIAS extensiones es el main (una por
   * host), igual que VS Code, donde todos los providers del selector reciben
   * la consulta.
   */
  async query(input: ProviderQueryInput): Promise<ProviderQueryResult> {
    const candidates = this.registrations.filter(
      (registration) =>
        registration.kind === input.kind &&
        this.options.match(registration.selector, input.document as unknown as MatchableDocument) > 0
    )
    if (candidates.length === 0) return { matched: false, result: null }

    const token = neverCancelledToken()
    const position =
      input.position !== undefined
        ? new Position(input.position.line, input.position.character)
        : undefined
    const range = input.range !== undefined ? toRange(input.range) : undefined

    for (const candidate of candidates) {
      try {
        const raw = await invoke(candidate, input, position, range, token)
        if (raw === undefined) continue
        return { matched: true, result: serialize(input.kind, raw) }
      } catch (error) {
        // Un proveedor roto NO puede tumbar al IDE (ni a las otras
        // extensiones): se loguea con nombre y apellido y se sigue.
        this.options.log(
          'warn',
          `el proveedor de ${input.kind} falló: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
    return { matched: true, result: null }
  }
}

/** Llama al método del proveedor que corresponde al tipo (firma REAL del API). */
function invoke(
  candidate: Registration,
  input: ProviderQueryInput,
  position: Position | undefined,
  range: Range | undefined,
  token: CancellationTokenLike
): unknown {
  const provider = candidate.provider
  const document = input.document
  const call = (name: string, ...args: unknown[]): unknown => {
    const method = provider[name]
    if (typeof method !== 'function') {
      throw new Error(`el proveedor de ${candidate.kind} no implementa ${name}()`)
    }
    return (method as (...inner: unknown[]) => unknown).call(provider, ...args)
  }

  switch (candidate.kind) {
    case 'hover':
      return call('provideHover', document, position, token)
    case 'definition':
      return call('provideDefinition', document, position, token)
    case 'declaration':
      return call('provideDeclaration', document, position, token)
    case 'implementation':
      return call('provideImplementation', document, position, token)
    case 'typeDefinition':
      return call('provideTypeDefinition', document, position, token)
    case 'references':
      return call(
        'provideReferences',
        document,
        position,
        { includeDeclaration: input.context?.includeDeclaration === true },
        token
      )
    case 'documentHighlight':
      return call('provideDocumentHighlights', document, position, token)
    case 'formatting':
      return call(
        'provideDocumentFormattingEdits',
        document,
        {
          tabSize: input.options?.tabSize ?? 2,
          insertSpaces: input.options?.insertSpaces !== false
        },
        token
      )
    case 'rangeFormatting':
      return call(
        'provideDocumentRangeFormattingEdits',
        document,
        range,
        {
          tabSize: input.options?.tabSize ?? 2,
          insertSpaces: input.options?.insertSpaces !== false
        },
        token
      )
  }
}

function toRange(range: ProviderRange): Range {
  return new Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  )
}

/**
 * Serializa el resultado a la forma del LSP (lo que ya consumen el hover, el
 * "ir a definición" y el formateo del IDE). Se hace aquí, en el host, porque es
 * el único lugar donde existen las clases REALES del API de VS Code.
 */
export function serialize(kind: LanguageProviderKind, raw: unknown): unknown {
  switch (kind) {
    case 'hover':
      return serializeHover(raw)
    case 'definition':
    case 'declaration':
    case 'implementation':
    case 'typeDefinition':
    case 'references':
      return serializeLocations(raw)
    case 'documentHighlight':
      return serializeHighlights(raw)
    case 'formatting':
    case 'rangeFormatting':
      return serializeTextEdits(raw)
  }
}

/**
 * `Hover` → `{ contents: { value }, range? }`.
 *
 * `Hover.contents` admite TRES formas (string, `MarkdownString`/`MarkedString`
 * y array de esas) y el hover del IDE pinta markdown: se aplanan a UN
 * documento en vez de mandar la estructura cruda, que la UI tendría que
 * interpretar (y que los servers reales mandan como `MarkupContent`, no como
 * array). Un `MarkedString` con `language` se arma como bloque de código
 * (perder el lenguaje era perder el resaltado).
 */
export function serializeHover(raw: unknown): unknown {
  const hover = raw as { contents?: unknown; range?: unknown } | null | undefined
  const contents = Array.isArray(hover?.contents) ? hover?.contents : [hover?.contents]
  const parts: string[] = []
  for (const entry of contents ?? []) {
    const text = markedStringToText(entry)
    if (text.length > 0) parts.push(text)
  }
  const range = serializeRange(hover?.range)
  return {
    contents: { value: parts.join('\n\n'), kind: 'markdown' },
    ...(range ? { range } : {})
  }
}

function markedStringToText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const candidate = value as { value?: unknown; language?: unknown }
  const text = typeof candidate.value === 'string' ? candidate.value : ''
  if (typeof candidate.language === 'string' && candidate.language.length > 0) {
    return `\`\`\`${candidate.language}\n${text}\n\`\`\``
  }
  return text
}

/**
 * `Location | Location[] | LocationLink[]` → `[{ uri, range }]`.
 *
 * Los dos shapes existen y significan lo mismo para el editor: `Location`
 * (`uri` + `range`) es el clásico y `LocationLink` (`targetUri` +
 * `targetSelectionRange`) es el que devuelven tsserver/rust-analyzer. Sin
 * unificar aquí, la mitad de los servers "no irían a la definición".
 */
export function serializeLocations(raw: unknown): Array<{ uri: string; range: unknown }> {
  const list = Array.isArray(raw) ? raw : [raw]
  const out: Array<{ uri: string; range: unknown }> = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as {
      uri?: { toString(): string }
      range?: unknown
      targetUri?: { toString(): string }
      targetSelectionRange?: unknown
      targetRange?: unknown
    }
    const uri = candidate.uri ?? candidate.targetUri
    if (!uri || typeof uri.toString !== 'function') continue
    const range = serializeRange(
      candidate.range ?? candidate.targetSelectionRange ?? candidate.targetRange
    )
    if (!range) continue
    out.push({ uri: uri.toString(), range })
  }
  return out
}

/** `DocumentHighlight[]` → `[{ range, kind? }]` (el `kind` ya es el del LSP). */
export function serializeHighlights(raw: unknown): Array<{ range: unknown; kind?: number }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ range: unknown; kind?: number }> = []
  for (const entry of raw) {
    const range = serializeRange((entry as { range?: unknown } | null)?.range)
    if (!range) continue
    const kind = (entry as { kind?: unknown }).kind
    out.push(typeof kind === 'number' ? { range, kind } : { range })
  }
  return out
}

/** `TextEdit[]` → `[{ range, newText }]` (lo que el editor aplica al buffer). */
export function serializeTextEdits(raw: unknown): Array<{ range: unknown; newText: string }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ range: unknown; newText: string }> = []
  for (const entry of raw) {
    const edit = entry as { range?: unknown; newText?: unknown } | null
    const range = serializeRange(edit?.range)
    if (!range || typeof edit?.newText !== 'string') continue
    out.push({ range, newText: edit.newText })
  }
  return out
}

/** `Range` del API (clase o forma compatible) → `{ start, end }` 0-based. */
export function serializeRange(raw: unknown): ProviderRange | null {
  if (!raw || typeof raw !== 'object') return null
  const range = raw as { start?: unknown; end?: unknown }
  const start = serializePosition(range.start)
  const end = serializePosition(range.end)
  if (!start || !end) return null
  return { start, end }
}

export function serializePosition(raw: unknown): ProviderPosition | null {
  if (!raw || typeof raw !== 'object') return null
  const position = raw as { line?: unknown; character?: unknown }
  if (typeof position.line !== 'number' || typeof position.character !== 'number') return null
  return { line: position.line, character: position.character }
}

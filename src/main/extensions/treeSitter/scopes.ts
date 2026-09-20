/**
 * Capturas de tree-sitter → scopes + tokens de la línea.
 *
 * Función PURA (no toca wasm ni disco) y por eso es la que se testea: el resto
 * del worker es transporte y caché.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CONVERSIÓN QUE IMPORTA
 *
 * **Nesting.** Las capturas de una query vienen por nodo, no por nivel: para
 * saber el scope stack de una captura hay que ver qué capturas la CONTIENEN.
 * Se hace con un barrido + pila (las capturas de un árbol son laminadas: dos
 * rangos o son ajenos o uno contiene al otro), así que es O(n log n) y no
 * O(n²) — con un archivo grande hay decenas de miles de capturas y el doble
 * bucle se notaba al abrir.
 *
 * Lo que NO hay que hacer es traducir los índices del parser a columnas UTF-16:
 * ver el bloque de abajo, donde está medido por qué el espacio de índices del
 * binding YA es UTF-16.
 */

/** Una captura cruda de tree-sitter (índices UTF-16 del texto). */
export interface RawCapture {
  start: number
  end: number
  /** Nombre del `@capture` (`keyword.function`, `string.quoted`…). */
  name: string
  /**
   * Propiedades `#set!` de ESA captura (no del match).
   *
   * Las usan las inyecciones (`injection.language` colgado de un capture) y el
   * plegado (`fold.kind`), que son datos del paquete y no están en el nombre.
   */
  properties?: Record<string, string | null>
}

export interface ScopeToken {
  line: number
  /** Inicio en columnas UTF-16 de la línea (0-based), igual que el motor. */
  start: number
  end: number
  /** Índice en `scopeSets`. */
  scopes: number
}

export interface ScopeTokenResult {
  scopeSets: string[][]
  tokens: ScopeToken[]
}

/**
 * Los índices de tree-sitter SON columnas UTF-16 (no hay que convertir nada).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ESTÁ ESCRITO (y por qué casi lo hago mal)
 *
 * La documentación de tree-sitter habla de "offsets en bytes", así que lo
 * natural es codificar el texto a UTF-8 y traducir cada índice. HECHO ESO, EL
 * COLOR SALE CORRIDO: el binding de web-tree-sitter pasa el texto con
 * `(index) => texto.slice(index)`, o sea que su espacio de índices son unidades
 * UTF-16 del string, no bytes. Medido con el parser real de JavaScript:
 *
 *   `const a = "😀"`  → la captura de `string` es [10, 14] (4 unidades)
 *   `const a = "ab"`  → [10, 14] (4 unidades)
 *   (en bytes, la primera sería [10, 16])
 *
 * O sea: el índice que devuelve el parser ya está en la misma unidad que la
 * columna de la línea del editor. Convertirlo "de byte a UTF-16" descoloca todo
 * lo que venga después del primer carácter multibyte. Aquí no se convierte: se
 * usa el índice tal cual.
 */

/** Índices UTF-16 donde empieza cada línea del texto. */
export function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1)
  }
  return starts
}

/** Índice UTF-16 → línea/columna (el `starts` viene de `lineStarts`). */
export function positionAt(index: number, starts: number[]): { line: number; column: number } {
  // Búsqueda binaria: un archivo grande produce miles de tokens por línea y el
  // barrido lineal desde el inicio era el segundo costo más caro del proceso.
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= index) low = mid
    else high = mid - 1
  }
  return { line: low, column: index - starts[low] }
}

/**
 * Capturas → tokens con su scope stack, en el formato que ya come el renderer.
 *
 * Los tokens salen ordenados por posición y, en el mismo rango, la captura más
 * interna va DESPUÉS (gana al aplicar: así los scopes anidados pintan encima,
 * que es la semántica de tree-sitter).
 */
export function buildScopeTokens(captures: RawCapture[], text: string): ScopeTokenResult {
  const scopeSets: string[][] = []
  const interned = new Map<string, number>()
  const intern = (scopes: string[]): number => {
    const key = scopes.join(' ')
    const found = interned.get(key)
    if (found !== undefined) return found
    const index = scopeSets.length
    scopeSets.push(scopes)
    interned.set(key, index)
    return index
  }

  if (captures.length === 0) return { scopeSets, tokens: [] }

  // Orden: por inicio ascendente y fin descendente (el rango que contiene va
  // antes). A igual rango, por nombre, para que dos corridas den lo mismo.
  const ordered = [...captures].sort(
    (a, b) =>
      a.start - b.start || b.end - a.end || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  )

  const starts = lineStarts(text)

  const stack: RawCapture[] = []
  const tokens: ScopeToken[] = []
  for (const capture of ordered) {
    // Se desapila lo que ya terminó (o lo que empieza donde mismo: hermanos,
    // no ancestros). `<=` es lo que permite que dos capturas idénticas del
    // mismo nodo queden una al lado de la otra en vez de anidarse.
    while (stack.length > 0 && stack[stack.length - 1].end <= capture.start) stack.pop()

    const scopes = [...stack.map((entry) => entry.name), capture.name]
    // Índices del árbol = índices UTF-16 del texto (ver arriba). Se recorta al
    // largo real por si un parser devuelve un rango más largo que el texto.
    const startIndex = Math.max(0, Math.min(capture.start, text.length))
    const endIndex = Math.max(0, Math.min(capture.end, text.length))
    if (endIndex > startIndex) {
      const from = positionAt(startIndex, starts)
      const to = positionAt(endIndex, starts)
      // Una captura multilínea se parte por línea: el motor pinta por rango
      // DENTRO de una línea, y un token que cruza el salto no se pinta.
      if (from.line === to.line) {
        tokens.push({ line: from.line, start: from.column, end: to.column, scopes: intern(scopes) })
      } else {
        for (let line = from.line; line <= to.line; line++) {
          const lineStart = starts[line]
          const lineEnd = line + 1 < starts.length ? starts[line + 1] - 1 : text.length
          const start = Math.max(startIndex, lineStart)
          const end = Math.min(endIndex, lineEnd)
          if (end <= start) continue
          const fromCol = start - lineStart
          const toCol = end - lineStart
          tokens.push({ line, start: fromCol, end: toCol, scopes: intern(scopes) })
        }
      }
    }

    stack.push(capture)
  }

  tokens.sort((a, b) => a.line - b.line || a.start - b.start || a.end - b.end)
  return { scopeSets, tokens }
}

/**
 * Compatibilidad de ABI entre el parser cargado y lo que declara el paquete.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ES UN ERROR FATAL
 *
 * Un parser compilado contra otra ABI no siempre falla: muchas veces parsea y
 * devuelve un árbol con nodos que las queries ya no conocen. El resultado
 * visible es el peor de todos — el archivo se pinta parcialmente raro y nada
 * dice por qué. Por eso la ABI se comprueba y se AVISA con el nombre del
 * lenguaje y las dos versiones; el usuario decide, pero deja de ser un misterio.
 */

/** Resultado de la comprobación. */
export interface AbiCheck {
  /** ABI real del `.wasm` cargado. */
  version: number
  /** Aviso a loguear, o `null` si todo coincide. */
  warning: string | null
}

/**
 * `tree-sitter-abi-14` | `abi-14` | `14` → 14. Sin número declarado → `null`
 * (no se avisa de lo que no se declaró: un warning inventado enseña a ignorar
 * los warnings).
 */
export function parseDeclaredAbi(declared: string | undefined): number | null {
  if (!declared) return null
  const match = /(\d+)\s*$/.exec(declared.trim())
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

/** Compara la ABI real del parser con la declarada en el paquete. */
export function classifyParserAbi(
  language: { abiVersion: number },
  declared: string | undefined
): AbiCheck {
  const version = language.abiVersion
  const expected = parseDeclaredAbi(declared)
  if (expected === null) return { version, warning: null }
  if (expected === version) return { version, warning: null }
  return {
    version,
    warning: `ABI distinta: el paquete declara ${expected} y el parser cargado es ${version}`
  }
}

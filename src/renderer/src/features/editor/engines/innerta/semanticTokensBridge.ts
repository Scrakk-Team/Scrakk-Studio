/**
 * Semantic tokens del LSP → canal de tokens del host.
 *
 * Según `editor.highlightSource`:
 *  - 'lsp' | 'mixed' → pide tokens al server activo y los publica.
 *  - 'treesitter'    → limpia lo suyo (el motor pinta solo Tree-sitter).
 *
 * Se dispara al abrir archivo (loadFile) y ante cambios del setting.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS COSAS QUE CAMBIARON Y POR QUÉ
 *
 * 1. **Ya no empuja al motor directo**: publica en `hostTokens`, que fusiona
 *    las fuentes por prioridad. Antes esta era la única fuente y escribía el
 *    buffer del motor; ahora comparte canal con la gramática de una extensión.
 * 2. **Ya no traduce nada**: los tokens del protocolo se normalizan a
 *    `HostToken` (con el slot resuelto por `slotForLegend`) y el encoding lo
 *    hace el canal. Así el engine recibe SIEMPRE el mismo formato, venga de un
 *    servidor o de una gramática TextMate.
 *
 * (El `tokenType` de la leyenda del server se mapea con el MISMO resolutor que
 * los scopes de TextMate: ver `src/shared/syntax/legend.ts`.)
 */

import type { InnertaModule } from './InnertaEngine'
import { lspSemanticTokensFull, decodeSemanticTokens } from '@services/lsp'
import { getPersistedHighlightSource } from '@services/storage'
import { legendName, slotForLegend, type HostToken } from '@shared/syntax'
import { setSourceTokens } from './hostTokens'
import { clearHighlightSnapshot, recordHighlightSnapshot } from './highlightSnapshot'

declare const __APP_VERSION__: string
void __APP_VERSION__

let debounceTimer: ReturnType<typeof setTimeout> | undefined

/** Leyenda del server → tokens del host (con slot resuelto). */
function toHostTokens(data: number[] | undefined): HostToken[] {
  return decodeSemanticTokens(data).map((token) => ({
    line: token.line,
    startChar: token.startCharacter,
    length: token.length,
    slot: slotForLegend(token.tokenType)
  }))
}

function pushTokens(mod: InnertaModule, path: string): void {
  void lspSemanticTokensFull(path)
    .then((result) => {
      const tokens = toHostTokens(result?.data)
      setSourceTokens(mod, path, 'semanticTokens', tokens.length > 0 ? tokens : null)
      // Procedencia para el panel de inspección. Acá el "scope" es el tipo de
      // la leyenda del server (`keyword`, `variable`): es lo único que el
      // protocolo semántico dice, y confundirlo con un scope TextMate
      // mostraría un dato inventado.
      if (tokens.length > 0) {
        recordHighlightSnapshot({
          path,
          source: 'semanticTokens',
          languageId: null,
          scopeName: null,
          extensionId: null,
          tokens: decodeSemanticTokens(result?.data).map((token) => ({
            line: token.line,
            startChar: token.startCharacter,
            length: token.length,
            slot: slotForLegend(token.tokenType),
            // El tipo de la leyenda, con NOMBRE: "legend 15" no le dice nada a
            // quien está mirando por qué un token salió verde.
            detail: [legendName(token.tokenType)]
          })),
          at: Date.now()
        })
      } else {
        clearHighlightSnapshot(path, 'semanticTokens')
      }
    })
    .catch((error: unknown) => {
      // Sin server para este lenguaje (lo normal) o fallo del request: la
      // fuente se limpia y las demás siguen. Sin el catch quedaba una
      // promesa rechazada sin dueño en la consola.
      console.debug('[lsp] sin semantic tokens para', path, error)
      setSourceTokens(mod, path, 'semanticTokens', null)
      clearHighlightSnapshot(path, 'semanticTokens')
    })
}

export function clearSemanticTokens(mod: InnertaModule, path: string): void {
  setSourceTokens(mod, path, 'semanticTokens', null)
  clearHighlightSnapshot(path, 'semanticTokens')
}

/** Llamar tras loadFile de un archivo con LSP activo. */
export function refreshSemanticTokens(
  mod: InnertaModule,
  path: string,
  immediate = false
): void {
  const source = getPersistedHighlightSource()
  if (source === 'treesitter') {
    clearSemanticTokens(mod, path)
    return
  }

  const run = (): void => pushTokens(mod, path)
  if (immediate) {
    run()
    return
  }

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(run, 300)
}

// Decodificador expuesto para tests/depuración.
export { decodeSemanticTokens }

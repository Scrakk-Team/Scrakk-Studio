/**
 * Puente de resaltado con gramática de extensión (TextMate).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ ATRAVIESA AQUÍ
 *
 *   archivo abierto → lenguaje del registro SEF → gramática del paquete
 *   → tokenizado en el MAIN (scopes) → slots (resueltos aquí)
 *   → tokens del host → motor
 *
 * Si no hay gramática de extensión, NO hace nada: no limpia lo del motor ni
 * cambia el lenguaje. "Sin gramática" no es "sin colores" — los 20 lenguajes
 * que el motor tiene compilados siguen pintándose solos, y el LSP sigue
 * aportando lo suyo por su propio canal.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY DEBOUNCE
 *
 * El tokenizado es O(n) sobre el archivo y viaja por IPC. Tipear dispara
 * `RevisionChanged` muchas veces por segundo: sin debounce, cada tecla sería un
 * tokenizado completo. 250 ms es el mismo orden que usa el camino del LSP y se
 * percibe inmediato (el color del texto ya pintado no desaparece mientras se
 * recalcula: recién al llegar el nuevo merge se reemplaza).
 */

import type { InnertaModule } from './InnertaEngine'
import { setSourceTokens } from './hostTokens'
import { clearHighlightSnapshot, recordHighlightSnapshot } from './highlightSnapshot'
import { currentThemeTokenRules } from './themeTokenRules'
import { resolveLanguage, selectGrammarEngine } from './grammarSelection'
import { tokenizeWithLanguageGrammar } from '@services/extensions/types/languages/highlight'

/** Debounce por módulo: cada editor (tab) tiene el suyo. */
const timers = new WeakMap<InnertaModule, ReturnType<typeof setTimeout>>()
/** Última petición de cada módulo (para descartar respuestas viejas). */
const currentRun = new WeakMap<InnertaModule, number>()
let runSeq = 0

const DEBOUNCE_MS = 250

/**
 * Aplica el lenguaje resuelto por una extensión al motor.
 *
 * Lo usan los DOS puentes (la gramática TextMate y el parser tree-sitter
 * dinámico): el motor necesita saber de qué lenguaje es el buffer para (a) usar
 * su gramática embebida si la tiene y (b) caer a `plaintext` si no, que es el
 * modo donde los tokens del host se pintan sin competir con nada.
 */
export function applyLanguage(mod: InnertaModule, languageId: string): void {
  try {
    mod.setLanguage?.(languageId)
  } catch {
    // WASM viejo sin `SetInnertaLanguage`: los tokens igual llegan (la fuente
    // mixta los pinta encima), así que no es fatal.
  }
}

/**
 * Recalcula el resaltado de la extensión para este archivo.
 *
 * `immediate` lo usa la apertura de archivo (el usuario está mirando el
 * archivo: esperar el debounce se nota como un parpadeo de color).
 */
export function refreshLanguageHighlight(
  mod: InnertaModule,
  path: string,
  text: string,
  options: { immediate?: boolean; languageId?: string } = {}
): void {
  const existing = timers.get(mod)
  if (existing) clearTimeout(existing)

  const run = (): void => {
    // El motor de gramática lo elige el USUARIO (Ajustes → Resaltado) y la
    // decisión vive en un solo lugar. Si eligió el árbol del paquete, aquí no se
    // publica nada: los dos puentes pintarían el mismo rango sin desempate.
    // Se limpia lo nuestro igual, porque el cambio puede venir justo de tener
    // TextMate seleccionado antes (si no, quedaría su color pegado).
    const language = resolveLanguage(path, options.languageId)
    if (selectGrammarEngine(language) !== 'textMate') {
      setSourceTokens(mod, path, 'textMate', null)
      clearHighlightSnapshot(path, 'textMate')
      return
    }

    const seq = ++runSeq
    currentRun.set(mod, seq)
    // Las reglas del TEMA entran al resolutor: si el tema distingue
    // `comment.line` de `comment.block`, la gramática de la extensión lo
    // respeta. Se leen en cada corrida (no se cachean) porque el usuario puede
    // cambiar de tema y el resaltado tiene que seguirlo.
    const rules = currentThemeTokenRules()
    void tokenizeWithLanguageGrammar({ path, text, languageId: options.languageId, rules })
      .then((highlight) => {
        // Respuesta vieja (el archivo cambió mientras el main tokenizaba): se
        // descarta. Sin esto, un archivo grande podía pintarse con tokens de
        // una versión anterior del texto.
        if (currentRun.get(mod) !== seq) return
        if (!highlight) {
          setSourceTokens(mod, path, 'textMate', null)
          clearHighlightSnapshot(path, 'textMate')
          return
        }
        applyLanguage(mod, highlight.languageId)
        setSourceTokens(mod, path, 'textMate', highlight.tokens)
        // Procedencia para el panel de inspección: el scope stack de CADA token,
        // leído del array interneado que ya vino del main (no hay costo extra).
        recordHighlightSnapshot({
          path,
          source: 'textMate',
          languageId: highlight.languageId,
          scopeName: highlight.scopeName,
          extensionId: highlight.extensionId,
          tokens: highlight.tokens.map((token, index) => ({
            line: token.line,
            startChar: token.startChar,
            length: token.length,
            slot: token.slot,
            detail: highlight.scopeSets[highlight.scopeIndex[index] ?? -1] ?? []
          })),
          at: Date.now()
        })
      })
      .catch((error: unknown) => {
        console.warn('[languages] resaltado con gramática falló:', error)
      })
  }

  if (options.immediate) {
    run()
    return
  }
  timers.set(mod, setTimeout(run, DEBOUNCE_MS))
}

/** El archivo ya no está: se saca lo de esta fuente. */
export function clearLanguageHighlight(mod: InnertaModule, path: string): void {
  const existing = timers.get(mod)
  if (existing) {
    clearTimeout(existing)
    timers.delete(mod)
  }
  runSeq++
  currentRun.delete(mod)
  setSourceTokens(mod, path, 'textMate', null)
  clearHighlightSnapshot(path, 'textMate')
}

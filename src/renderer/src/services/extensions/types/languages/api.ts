// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión `languages` — handler.
 *
 * Registra el kit completo de un lenguaje. Lo que hace al registrar:
 *
 *  1. Lee `language-configuration.json` (si viene) y lo normaliza.
 *  2. Lee los archivos de snippets.
 *  3. Lee **TODAS** las queries `.scm` declaradas y las categoriza (incluidas
 *     las desconocidas: `unknown` no se descarta nunca).
 *  4. Arma el `RegisteredLanguage` con sus capabilities declaradas y lo mete
 *     en el `LanguageRegistry`.
 *
 * Un lenguaje registrado NO tokeniza nada por sí solo: eso lo hace el worker
 * (tree-sitter dinámico) o el motor (los 20 compilados). Aquí se declara el
 * lenguaje, se indexan sus datos y se dice con honestidad qué pieza está.
 */

import type { AnyExtensionTypeHandler, ExtensionTypeContext } from '../handler'
import {
  LanguageRegistry,
  loadQueryData,
  parseLanguageConfiguration,
  parseSnippets,
  type LanguageQueryData,
  type RegisteredLanguage
} from './logic'
import { parseLanguagesContribution, type GrammarContribution, type LanguageContribution } from './schema'
import { getLanguageOverride, hasNativeConsent } from './store'

/** Lo que devuelve el registro (para desinstalar). */
export interface RegisteredLanguageRef {
  extensionId: string
  languageId: string
}

/**
 * Filtra las gramáticas que se pueden usar DE VERDAD.
 *
 * Tres razones para descartar una, y las tres se dicen en el log (nunca se
 * descarta en silencio):
 *  - el archivo de la gramática no se puede leer;
 *  - el parser no está en el paquete;
 *  - el parser es NATIVO y el usuario todavía no dio su consentimiento (un
 *    `.so`/`.dll` es código nativo: no se carga porque una extensión lo pida).
 */
async function usableGrammars(
  grammars: GrammarContribution[],
  languageId: string,
  ctx: ExtensionTypeContext
): Promise<GrammarContribution[]> {
  const out: GrammarContribution[] = []
  for (const grammar of grammars) {
    if (grammar.kind === 'textMate') {
      const text = await ctx.readFile(grammar.path)
      if (text === null) {
        console.warn(`[languages] ${languageId}: no se pudo leer la gramática ${grammar.path}`)
        continue
      }
      out.push(grammar)
      continue
    }

    // tree-sitter: el parser es binario, así que la lectura es una PRUEBA DE
    // EXISTENCIA (no se parsea el contenido aquí).
    const parser = await ctx.readFile(grammar.parser)
    if (parser === null) {
      console.warn(`[languages] ${languageId}: falta el parser ${grammar.parser}`)
      continue
    }
    if (grammar.native && !hasNativeConsent(grammar.parser, grammar.sha256)) {
      console.warn(
        `[languages] ${languageId}: parser nativo ${grammar.parser} sin permiso del usuario — no se activa`
      )
      continue
    }
    out.push(grammar)
  }
  return out
}

async function buildLanguage(
  contribution: LanguageContribution,
  ctx: ExtensionTypeContext
): Promise<RegisteredLanguage> {
  // ── 1. language-configuration.json ───────────────────────────────────────
  let configurationPath: string | undefined
  if (contribution.configuration) {
    const text = await ctx.readFile(contribution.configuration)
    // Se valida el parseo AHORA (no cuando el usuario abre un archivo): una
    // configuración rota se reporta en la instalación, no en el uso.
    if (text !== null && parseLanguageConfiguration(text) !== null) {
      configurationPath = contribution.configuration
    } else if (text !== null) {
      console.warn(
        `[languages] ${contribution.id}: "${contribution.configuration}" existe pero no es un language-configuration válido`
      )
    }
  }

  // ── 2. Snippets ──────────────────────────────────────────────────────────
  // Se leen para validar que son snippets de verdad (una extensión que declara
  // 200 snippets rotos debe reportarlo al instalar, no quedar en silencio).
  let snippetCount = 0
  for (const snippet of contribution.snippets ?? []) {
    const text = await ctx.readFile(snippet.path)
    if (text === null) continue
    snippetCount += parseSnippets(text, contribution.id).length
  }

  // ── 3. Gramáticas usables + queries (TODAS, categorizadas) ──────────────
  const declared = contribution.grammars ?? []
  const grammars = ctx.isBuiltin ? declared : await usableGrammars(declared, contribution.id, ctx)
  const droppedGrammars = declared.length - grammars.length
  if (droppedGrammars > 0) {
    console.warn(
      `[languages] ${contribution.id}: ${droppedGrammars} de ${declared.length} gramáticas no son usables (motivos arriba)`
    )
  }

  const queries: LanguageQueryData[] = ctx.isBuiltin
    ? // Las builtin traen su índice embebido: no hay archivos en disco que
      // leer, así que se usa lo declarado en el manifest tal cual.
      await loadQueryData(grammars, undefined, async () => null)
    : await loadQueryData(grammars, undefined, (path) => ctx.readFile(path))

  // ── 4. Registro ──────────────────────────────────────────────────────────
  const semanticTokenScopes: Record<string, string[]> = {}
  for (const entry of contribution.semanticTokenScopes ?? []) {
    for (const [token, scopes] of Object.entries(entry.scopes)) {
      semanticTokenScopes[token] = [...(semanticTokenScopes[token] ?? []), ...scopes]
    }
  }

  return {
    id: contribution.id,
    aliases: contribution.aliases ?? [],
    extensions: contribution.extensions ?? [],
    filenames: contribution.filenames ?? [],
    filenamePatterns: contribution.filenamePatterns ?? [],
    firstLine: contribution.firstLine,
    icon: contribution.icon,
    configurationPath,
    grammars,
    snippets: contribution.snippets ?? [],
    semanticTokenScopes,
    configurationDefaults: contribution.configurationDefaults ?? {},
    queries,
    capabilities: {
      // Sólo cuenta si la gramática es usable: declarar 3 y no poder leer
      // ninguna tiene que reportarse como "sin resaltado", no como "ok".
      highlighting: grammars.length > 0,
      symbols: queries.some((query) => query.category === 'tags'),
      locals: queries.some((query) => query.category === 'locals'),
      injections:
        queries.some((query) => query.category === 'injections') ||
        grammars.some(
          (grammar) =>
            grammar.kind === 'textMate' &&
            (Boolean(grammar.embeddedLanguages) || Boolean(grammar.injectTo?.length))
        ),
      folding: queries.some((query) => query.category === 'folds'),
      snippets: snippetCount > 0,
      configuration: configurationPath !== undefined
    },
    extensionId: ctx.extensionId
  }
}

export const languagesHandler: AnyExtensionTypeHandler = {
  kind: 'languages',

  parse(raw, ctx): LanguageContribution[] | null {
    return parseLanguagesContribution(raw, ctx)
  },

  async register(
    contribution: LanguageContribution,
    ctx: ExtensionTypeContext
  ): Promise<RegisteredLanguageRef> {
    const language = await buildLanguage(contribution, ctx)

    // El override del usuario se aplica aquí, una sola vez: si el lenguaje está
    // desactivado, no se registra y no hay `onLanguage`.
    const override = getLanguageOverride(language.id)
    if (override.disabled) {
      console.info(`[languages] ${language.id} desactivado por el usuario: no se registra`)
    } else {
      LanguageRegistry.register(language)
    }

    return { extensionId: ctx.extensionId, languageId: language.id }
  },

  unregister(owned: RegisteredLanguageRef[]): void {
    const extensionIds = new Set(owned.map((entry) => entry.extensionId))
    for (const extensionId of extensionIds) {
      LanguageRegistry.unregisterExtension(extensionId)
    }
  }
}

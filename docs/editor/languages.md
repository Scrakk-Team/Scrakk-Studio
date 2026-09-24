---
title: "Lenguajes: cómo una extensión agrega sintaxis (VS Code → SEF → Innerta)"
group: editor
order: 30
summary: "Cómo una extensión agrega sintaxis a un lenguaje: tree-sitter y TextMate como fuentes, un resolutor de estilos y un tipo SEF que trae el kit completo sin recompilar."
---
# Lenguajes: cómo una extensión agrega sintaxis (VS Code → SEF → Innerta)

Cuando abrís un `.rs` o un `.py`, el editor lo colorea. Este doc explica de
dónde sale ese color y cómo una extensión agrega un lenguaje nuevo.

Plan del sistema de lenguajes: **tree-sitter y TextMate como fuentes de primera
clase**, un solo resolutor de estilos, un tipo SEF que trae el kit completo y
carga de gramáticas **sin recompilar**. Diseño, no implementación.

Evidencia: el source de VS Code (`~/Documentos/Proyectos/vscode`) y el de Innerta
(`~/Documentos/Proyectos/InnertaEngine/InnertaEngine-Linux`).

---

## 1. Anatomía REAL de una extensión de lenguaje en VS Code

No es "un tipo": es un **kit**. Una extensión como `rust-analyzer` o
`vscode-python` activa entre 5 y 15 contribution points a la vez.

| Pieza | Contribution point | Qué aporta |
| --- | --- | --- |
| Identidad y asociación | `languages` | `id`, `extensions`, `filenames`, `filenamePatterns`, `firstLine`, `aliases`, `mimetypes`, `icon` (light/dark) |
| Comportamiento de edición | `languages[].configuration` | `language-configuration.json`: brackets, `autoClosingPairs`, `surroundingPairs`, `comments`, `folding`, `wordPattern`, `onEnterRules`, `indentationRules` |
| Color/tokenizado **TextMate** | `grammars` | `scopeName`, `path`, `embeddedLanguages`, `tokenTypes`, `injectTo`, `balancedBracketScopes`, `unbalancedBracketScopes` |
| Snippets | `snippets` | `language` + `path` |
| Defaults de editor por lenguaje | `configurationDefaults` | `"[rust]": { "editor.tabSize": 4 }` |
| Semantic tokens | `semanticTokenTypes`, `semanticTokenModifiers`, `semanticTokenScopes` | tipos propios + **mapeo tokenType/modifier → scope** |
| Servidor de lenguaje | (su `main` lo arranca; en SEF: `lspServers`) | navegación, diagnósticos, formato |
| Diagnósticos de build | `problemMatchers`, `problemPatterns` | parsear salidas de compilador |
| Tareas | `taskDefinitions` | cómo compilar/correr |
| Debug | `debuggers`, `breakpoints` | adaptador + tipos de archivo |
| UI y comandos | `commands`, `menus`, `keybindings`, `walkthroughs` | lo que el usuario ve |
| Validación de JSON/YAML | `jsonValidation` | schema para los archivos de config del lenguaje |
| REPL | `notebooks`, `notebookRenderer`, `notebookPreload` | consola interactiva |
| Plugins del TS server | `typescriptServerPlugins` | extensiones del servicio de TS |
| Empaquetado | `extensionPack`, `extensionDependencies` | un pack de lenguajes trae varios |

**Consecuencias para el plan:**
1. El reporte de instalación debe ser **por pieza**, no "soportado/no": la misma
   extensión puede dar color ✓, outline ✓, LSP ✓ y debug ✗.
2. Hay que modelar **activación por lenguaje** (`onLanguage:<id>`): el parser y
   las queries se cargan **lazy** al abrir el primer archivo de ese lenguaje.
3. Un kit de lenguaje toca varios kinds SEF (lenguaje + `lspServers` +
   `commands` + `menus` + `editorUI`). El loader ya resuelve kind por kind; el
   "kit" es una **presentación** (una ficha, no veinte).

---

## 2. Cómo tokeniza VS Code (pipeline real, con archivo)

1. **Registro**: `TMScopeRegistry` mapea `scopeName` → definición de gramática,
   guardando `injectTo`, `embeddedLanguages` y `tokenTypes`
   (`services/textMate/common/TMScopeRegistry.ts`).
2. **Contenido**: el Extension Host manda el `.tmLanguage` (JSON o plist) al
   renderer.
3. **Compilación**: `TMGrammarFactory` lo compila a un tokenizador; las
   gramáticas con `injectTo` se **inyectan en el tokenizador de otro lenguaje**
   (un plugin puede extender el grammar de otro).
4. **Tokenizado en un WORKER**: `textMateTokenizationWorker` +
   `threadedBackgroundTokenizerFactory`, con invalidación por región sucia.
   Nunca en el hilo de UI.
5. **Codificación del estilo**: cada token es **un u32**
   (`editor/common/encodedTokenAttributes.ts`):

```
bbbb bbbb ffff ffff fFFF FBTT LLLL LLLL
   bg(8)   fg(9)  style(4) B(1) type(2) lang(8)
```

   Y los semantic tokens reusan el **mismo u32** con flags `SEMANTIC_USE_*`
   (italic/bold/underline/strikethrough/foreground/background) en el byte de
   languageId → **un token semántico pisa SOLO lo que declara** (si no declara
   color, conserva el del TextMate).
6. **Resolución de tema**: `textMateScopeMatcher.ts` implementa un **lenguaje de
   selectores**: `,` = alternativas · espacio = conjunción · `-` = negación ·
   paréntesis · y **prioridades `R:` / `L:`** (más específico gana).
7. El array de u32 es el stream de tokens del editor, que pinta desde ahí.

> **La lección**: VS Code separa 4 cosas — (a) tokenizar, (b) resolver
> scope→estilo, (c) codificar el estilo, (d) pintar. **Innerta mezcla (a) y (b)
> dentro del C++**: `MapCaptureColor()` decide color con `substring` y 15 campos
> fijos del tema. Ese es el punto exacto a generalizar.

---

## 3. El puente conceptual: `@capture` ≡ `scope`

Medido en las queries reales de Innerta (`emscripten/queries/typescript/*.scm`):

```
@keyword  @type.builtin  @variable.parameter  @punctuation.bracket  @definition.function
```

Y los scopes de TextMate:

```
keyword.control.flow.js   variable.parameter.function.js   punctuation.definition.string.begin.ts
```

**Son el mismo espacio de nombres con puntos.** Y `MapCaptureColor` **ya asigna
prioridades** (comment 100, string 90, keyword/operator 80, type 70, tag 70,
function 60, constant 50, parameter 40, property/attribute 30, builtin 20,
punctuation 15, variable 10).

De ahí sale el diseño:

> **Un solo resolutor**: toda fuente produce `(rango, scope, prioridad)` y un
> único módulo resuelve estilo con selectores de scope (los del tema).

Esto elimina el techo de 15 categorías por substring **de una sola vez** y hace
que `tokenColors` de un tema funcione **igual** para tree-sitter, TextMate y
semantic tokens. Ni tree-sitter ni TextMate son casos especiales: son fuentes.

---

## 4. Las cuatro fuentes y su prioridad

| # | Fuente | Dónde corre | Qué produce | Rol |
| --- | --- | --- | --- | --- |
| 1 | **tree-sitter compilado** (20 lenguajes dentro del `.wasm` del engine) | dentro del engine | spans con capture | fuente base de esos 20, sin costo de datos y sin worker |
| 2 | **tree-sitter dinámico** (`.wasm` del `.sef`) | worker (`web-tree-sitter`) | spans + **tags/locals/injections** | el "agregar lenguajes sin recompilar" |
| 3 | **TextMate** (`.tmLanguage` de VSIX) | worker (`vscode-textmate` + `vscode-oniguruma`) | spans con scope stack | compatibilidad VSIX y lenguajes sin parser |
| 4 | **LSP semantic tokens** (ya funciona, `docs/lsp/api.md`) | main | spans con tokenType/modifier | **pisa por rango** lo que declara |

Más una capa aparte para **decoraciones y diagnósticos** (subrayados, fondos).

Regla de desempate: por rango gana la fuente de mayor prioridad; dentro de una
fuente, gana el selector de scope más específico (`R:`/`L:` como VS Code).

**tree-sitter no es el fallback**: es la fuente #1 (nativa) y #2 (dinámica). Las
otras dos cubren lo que tree-sitter no puede (gramáticas VSIX, y el refinamiento
del LSP).

---

## 5. Hallazgos que cambian el trabajo

### 5.1 `tags.scm` y `locals.scm` se envían y NUNCA se cargan

El repo trae `tags.scm` (definiciones y referencias) y `locals.scm` (variables
locales) por lenguaje, pero el C++ solo abre `highlights.scm` e `injections.scm`.

**Oportunidad grande**: `tags.scm` da **outline de símbolos y goto-definition sin
LSP** (es lo que hace nvim con este mismo ecosistema), y `locals.scm` da
resolución de locales. Son archivos que **ya están** en el repo.

### 5.2 Cargar una gramática nueva hoy implica recompilar

- **Desktop**: `TreeSitterLoader.cpp` hace `dlopen(path)` y resuelve
  `tree_sitter_<lang>` con `dlsym`. O sea: **ya es dinámico**… con dos problemas:
  - el `dlopen` corre **dentro del proceso** (en Electron eso es ejecución de
    código nativo arbitrario);
  - la lista de candidatos incluye **una ruta absoluta de una máquina de
    desarrollo** (`/home/julian/.../build-linux/libtreesitter.so`) → smell de deploy.
- **WASM**: la lookup va contra `kInnertaWasmSymbols`, una **tabla estática
  compilada** (`TreeSitterLoader.cpp`), y el build **no** usa dynamic linking.
  Más: los lenguajes válidos son un `switch` hardcodeado
  (`EditorWindow.cpp:941`, con el comentario *"Must match `tree_sitter_<name>`
  exports in libtreesitter.so + `queries/<name>/highlights.scm`"*).
- Las queries se buscan en `exeDir + "/queries/"` / `"queries/"` + fallbacks de
  dev → el layout es configurable (bien), pero **al lado del binario**.

### 5.3 VS Code usa exactamente las librerías que proponemos

`package.json` de VS Code: `"vscode-oniguruma": "1.7.0"` y
`"vscode-textmate": "^9.3.2"`. No es una apuesta: es el estándar.

---

## 6. El tipo SEF nuevo: `languages` (kit de lenguaje)

Va en SEF: `src/renderer/src/services/extensions/types/languages/{schema,api,logic,store}.ts`.

```jsonc
// manifest.json
{
  "contributes": {
    "languages": [
      {
        "id": "rust",
        "aliases": ["Rust"],
        "extensions": [".rs"],
        "filenames": [],
        "firstLine": "^#!/.*\\brust",
        "configuration": "language-configuration.json",
        "icon": { "light": "icons/rust-light.svg", "dark": "icons/rust-dark.svg" },

        "grammars": [
          {
            "kind": "treeSitter",                 // ← el pedido central
            "parser": "grammars/rust.wasm",       // wasm: recomendado
            "queries": "grammars/queries/rust/",  // highlights/localstags/injections
            "sha256": "…"
          },
          {
            "kind": "textMate",                   // ← compat VSIX
            "scopeName": "source.rust",
            "path": "syntaxes/rust.tmLanguage.json",
            "embeddedLanguages": { "meta.embedded.block.sql": "sql" },
            "tokenTypes": { "string.quoted": "string" },
            "injectTo": ["source.js"]
          }
        ],

        "snippets": [{ "path": "./snippets/rust.json" }],
        "configurationDefaults": { "editor.tabSize": 4 },
        "semanticTokenScopes": [{ "language": "rust", "scopes": { "keyword": ["keyword.control.rust"] } }]
      }
    ]
  }
}
```

Puntos de diseño:

- **Un kind, no tres**: en SEF "una extensión de lenguaje" es una cosa. El
  traductor VSIX junta `contributes.languages` + `contributes.grammars` +
  `contributes.snippets` + `configurationDefaults` en **una entrada**.
- **`grammars[].kind`** es lo que permite traer tree-sitter **o** TextMate (y
  ambos: tree-sitter para el árbol, TextMate para el color de terceros).
- Mapeo directo de VS Code → nuestro modelo:

| VS Code (TextMate) | Nuestro equivalente tree-sitter |
| --- | --- |
| `scopeName` + `path` (tmLanguage) | `parser` (wasm/nativo) + `highlights.scm` |
| `embeddedLanguages` (scope → languageId) | `injections.scm` (`@injection.content` / `@injection.language`) |
| `injectTo` (inyectar en el grammar de otro lenguaje) | `injections.scm` (inyecciones hacia otros lenguajes) |
| `tokenTypes` (scope → string/comment/regex) | capture name → tipo estándar (`StandardTokenType`) |
| `semanticTokenScopes` | idem (lado LSP) |
| — | **`tags.scm` → símbolos y goto-definition sin LSP** |
| `balancedBracketScopes` | (sin equivalente) |

---

## 7. Cargar gramáticas sin recompilar: los tres mecanismos

### (A) WASM en un worker — **recomendado**

- `web-tree-sitter` (el build emscripten **oficial** de tree-sitter, diseñado
  para cargar parsers `.wasm` en runtime) en un **worker**.
- El `.sef` trae `parser.wasm` (generado con `tree-sitter build --wasm`).
- El worker corre las queries (`highlights`, `tags`, `locals`, `injections`) y
  devuelve **datos**: spans, símbolos, folds, inyecciones.
- Esos datos entran al engine por el **paint list** (la misma ruta que TextMate
  y semantic tokens).
- **Seguridad**: el wasm corre en el sandbox del runtime (memoria propia, sin
  syscalls, sin FS, sin red). El `.sef` **no ejecuta código nativo**.
- **Costo**: CPU. Se paga con lo mismo que VS Code: tokenizar el rango visible
  primero, cache por línea e invalidación por región sucia.
- **Límite honesto**: el árbol vive en el worker, así que el engine no lo puede
  usar internamente (fold/injections/tags viajan como datos calculados).

### (B) `.so` / `.dll` nativo — escape hatch, **aislado**

- **Nunca** `dlopen` en el proceso principal: es Electron main → cualquier `.sef`
  de terceros sería ejecución de código nativo con acceso a fs/red/IPC.
- Cargar en un **proceso separado** (`utilityProcess`) con:
  - **pre-flight**: leer la tabla de símbolos del binario **sin ejecutarlo** y
    exigir la allowlist (`tree_sitter_<lang>`, `tree_sitter_<lang>_external_scanner_*`, ABI);
  - hash/pin por `sha256` del asset;
  - sin acceso al IPC de la app salvo su `MessagePort`; matable y reiniciable;
  - **consentimiento explícito** ("esta extensión trae código nativo") + nivel de
    confianza, como Workspace Trust de VS Code.
- Sirve para: gramáticas sin build wasm, o donde la perf importe.

### (C) dynamic linking de emscripten (`dlopen` de *side modules* wasm)

- Emscripten soporta `dlopen` de módulos wasm side (`-sMAIN_MODULE` /
  `-sSIDE_MODULE`): el engine cargaría `grammar.wasm` **en su propio runtime** y
  tendría el árbol adentro (fold, tags, injections sin worker).
- Costo: **todo** el build de Innerta pasa a dynamic linking (tamaño, arranque,
  complejidad) y el `.wasm` debe ser side module (no el formato estándar del
  ecosistema).
- Veredicto: **no de entrada**. Solo si (A) no alcanza.

> Con (A), el pedido "añadir lenguajes sin recompilar" se cumple **sin tocar el
> build de Innerta**. (C) es la versión "el engine también quiere el árbol".

---

## 8. Multi-tipo: cómo se compone y se reporta

- **Reporte por pieza** (color, outline, navegación, LSP, snippets, debug…), con
  su motivo cuando falta. Una extensión de lenguaje nunca es "soportada" o "no"
  en bloque.
- **Composición**: `languages` + `lspServers` (ya existe) + `editorUI` +
  `commands`/`menus` + `configuration` son kinds distintos que el loader ya
  despacha por separado. El kit es la **ficha** que los agrupa.
- **Activación**: `onLanguage:<id>` al abrir el primer archivo → cargar parser,
  queries y (si existe) arrancar el server. Sin eso, instalar 20 lenguajes
  costaría 20 workers al abrir la app.
- **Conflictos**: dos extensiones con el mismo `scopeName`/`id` (VS Code avisa y
  gana la última). Necesita regla explícita + override del usuario.

---

## 9. Fases

| Fase | Qué | Destraba |
| --- | --- | --- |
| **L0** | Ordenar el terreno: sacar la ruta absoluta del loader, unificar la lista hardcodeada de lenguajes de `EditorWindow.cpp`, declarar el layout de `queries/` | nada visible; evita seguir apilando sobre deuda |
| **L1** | **Resolutor de scopes + paint list** (el u32-style + paleta): una sola resolución para las 4 fuentes | **fundamento**: sin esto ninguna fuente colorea bien y el techo de 15 sigue |
| **L2** | **Tipo SEF `languages`** + registro + `onLanguage` + asociaciones + `language-configuration` | declarar un lenguaje (sin color todavía) |
| **L3** | **tree-sitter dinámico wasm en worker** (parser + `highlights` + `tags` + `injections` + `locals`) | **agregar lenguajes sin recompilar**, y outline/goto-definition sin LSP |
| **L4** | **TextMate** (`vscode-textmate` + oniguruma) para VSIX | `contributes.grammars` soportado; cualquier lenguaje colorea |
| **L5** | **Merge de semantic tokens** sobre el resolutor (pisa por rango lo que declara) | color exacto con LSP, sin perder el del árbol |
| **L6** | Snippets, folding desde el árbol, inyecciones anidadas, `locals` | fidelidad de lenguaje |
| **L7** | Nativo aislado (`utilityProcess`) + trust/permisos + hash | gramáticas sin wasm, con seguridad explícita |

**L1 es primero por una razón dura**: es el único punto del que dependen L3, L4 y
L5. Si se hace al final, hay que reescribir las tres.

---

## 10. Decisiones abiertas

1. **Nombre del kind**: `languages` (kit) vs `grammars` vs `treeSitter`. Con las
   tres cosas juntas (asociación + configuración + gramáticas), `languages` describe mejor.
2. **¿Un worker de tokenizado o uno por editor?** Hoy cada tab es un módulo WASM;
   un worker por tab multiplica RAM. Candidato: **un worker compartido** con cola.
3. **¿Quién es dueño del parser de un lenguaje?** Criterio propuesto: si el
   engine ya lo tiene compilado → engine (fuente #1); si no → worker (fuente #2).
   ¿Y si una extensión aporta una versión **mejor** de un lenguaje ya compilado?
4. **¿`.so`/`.dll` se soportan o solo wasm?** Recomendación: **wasm por defecto**,
   nativo opt-in con permiso.
5. **¿`tags.scm` habilita goto-definition y outline propios cuando no hay LSP?**
   Recomendación: **sí** — es gratis (archivos ya presentes) y es lo que hace nvim.
6. **¿Qué pasa con los 20 lenguajes hardcodeados** cuando exista la carga
   dinámica? ¿Se quedan como fast path (recomendado) o se migran todos al worker?

---

## 11. Riesgos

| Riesgo | Por qué duele | Mitigación |
| --- | --- | --- |
| 3 tokenizadores (engine nativo, worker tree-sitter, worker TextMate) | costo de CPU/RAM y tres verdades de color | una sola salida (spans) + un solo resolutor + tokenizar visible-first |
| Latencia del worker en archivos grandes | el color "llega tarde" | región sucia + cache por línea + prioridad a lo visible |
| El engine no puede consumir el árbol del worker | fold/injections/tags no son gratis | se calculan en el worker y viajan como datos |
| `dlopen` = RCE | cualquier `.sef` de terceros | proceso separado + allowlist de símbolos + hash + consentimiento |
| Deploy: ruta absoluta en el loader, `queries/` al lado del binario | funciona en la máquina de desarrollo y no en la del usuario | L0 |
| Dos extensiones con el mismo `scopeName`/`id` | color "aleatorio" según orden de instalación | regla explícita + override del usuario |
| Duplicar la verdad de cobertura | `surface/` ya existe para esto | cada fase actualiza una entrada, no una lista nueva |

---

## 12. Estado de implementación (lo que YA funciona)

Esta sección es la que hay que leer para saber qué está hecho de verdad. Todo lo
marcado ✅ está **verificado sobre la app compilada** con la extensión REAL de
Gleam (`gleam.gleam 2.13.0`, el `.vsix` queda en `~/Descargas`).

| Fase | Estado | Dónde vive |
| --- | --- | --- |
| **L0** terreno | ✅ | rutas absolutas fuera del loader (`INNERTA_TREESITTER_LIB`, `INNERTA_QUERIES_DIR`); lenguaje por ID en `SetInnertaLanguage`; fallback del engine ya no es `javascript` |
| **L1** resolutor + paint list | ✅ | `src/shared/syntax/scopes.ts` · `spans.ts` · `legend.ts` (selectores `R:`/`L:`, `-`, paréntesis, comas; u32 de VS Code; paleta) |
| **L2** tipo SEF `languages` | ✅ | `services/extensions/types/languages/{schema,logic,store,api}.ts` + traductor VSIX |
| **L3** tree-sitter dinámico | ✅ | `main/extensions/treeSitter/{manager,tokenizer,scopes,queryData,abi}.ts` + worker `entry.ts` (proceso aparte) + `treeSitterHighlightBridge.ts` |
| **L4** TextMate | ✅ | `main/extensions/tokenize.ts` (main, no worker: ver abajo) + `types/languages/highlight.ts` |
| **L5** merge LSP ↔ gramática | ✅ | `hostTokens.ts` (dueño único del canal) + `mergeHostTokens` |
| **L6** snippets / folding / locals | ✅ | snippets y `language-configuration` al registrar; **folding por árbol** (`SetInnertaFoldingRanges`) y **locals** (`resolveDefinition`) consumidos de verdad (ver 12.5) |
| **L7** nativo aislado | 🟡 | consentimiento por hash implementado (`store.ts`) y verificado en el manager; el camino nativo (`.so`/`.dll`) todavía no se carga |
| **Extra** lenguajes embebidos | ✅ | segunda pasada en `tokenize.ts` (inyecciones + `embeddedLanguages`) y, del lado dinámico, `injections.scm` re-tokenizado con el parser del lenguaje inyectado |
| **Extra** tokenColors del tema | ✅ | `themeTokenRules.ts`: los `tokenColors` entran como reglas del resolutor |
| **Extra** panel de inspección | ✅ | comando `editor.inspectTokens` + `features/editor/inspect/` |
| **Extra** outline por árbol | ✅ | `tags.scm` → `dynamicSyntax.ts` → panel **Esquema** (con click que mueve el cursor) |
| **Extra** ir a la definición sin LSP | ✅ | `locals.scm` → `resolveDefinition` → comando `editor.goToDefinition` (F12), con el LSP como respaldo |
| **Extra** expandir selección | ✅ | `textobjects.scm` → `editor.expandSelection` (Shift+Alt+→) vía `SetInnertaSelection` |
| **Extra** motor de gramática elegible | ✅ | `editor.grammarEngine` (`auto` / `treeSitter` / `textMate`) en Ajustes → Resaltado; la decisión vive en `grammarSelection.ts` |

### El canal que hizo posible todo esto

El motor tenía `SetInnertaSemanticTokens` **declarado y sin usar**: guardaba el
array y nada lo leía. Ahora es el canal único de color del host:

```
LSP (leyenda del server) ─────┐
Gramática TextMate ───────────┼─→ mergeHostTokens ─→ encodeHostTokens ─→ SetInnertaSemanticTokens
Tree-sitter dinámico (.wasm) ─┘        (prioridad)        (delta LSP)          (pinta el C++)
```

Y hay un detalle que sólo se ve mirando la glue de emscripten: **pasar un array
JS a un export que espera puntero no funciona** (se coerciona a número → `NULL`).
El camino viejo hacía exactamente eso, así que los tokens del LSP nunca llegaron
al motor y no había ningún error visible. La forma correcta (`malloc` + `HEAP32`
+ `free`) está en `innertaLoader.ts` y es la que usan los bookmarks.

### Tokenizar en el main (y no en un worker)

El plan pedía un worker. La implementación usa el **proceso main** porque:

1. los `.tmLanguage` están en disco y el main ya puede leerlos (con verificación
   de que la ruta esté DENTRO de `userData/extensions`: una ruta que viene de un
   manifest es dato de terceros);
2. el `.wasm` de Oniguruma se resuelve por `require.resolve` — en el renderer
   habría que versionar un binario en `public/` o pelear con `fetch` sobre `file://`;
3. **no bloquea la UI** igual que un worker: es otro proceso.

El renderer manda rutas + texto y recibe **scopes** (internea-dos, para que un
archivo grande no viaje como decenas de miles de objetos). El color se resuelve
en el renderer porque el tema vive ahí.

### Lenguajes embebidos (hecho)

Un bloque de Gleam dentro de markdown necesita DOS cosas y las dos están:

1. **Inyección** (`injectTo`): la gramática ajena se aplica DENTRO de la padre y
   marca el tramo (`meta.embedded.block.gleam`). Sin esto no hay nada que
   re-tokenizar; es el error clásico de implementar sólo la mitad.
2. **Segunda pasada** (`embeddedLanguages`): ese scope mapea a un id de lenguaje
   y su gramática tokeniza el tramo con su propio stack, que se conserva entre
   líneas (si no, un bloque multilínea se rompe en la segunda línea).

El renderer manda las tres familias de gramáticas (raíz, embebidas e inyectadas)
para que el main pueda hacer las dos pasadas.

### El color del tema manda (también en las gramáticas)

`applyInnertaTheme` ya mapeaba `tokenColors` a los 15 campos del motor. Lo que
faltaba es que ese mismo mapeo entrara como REGLAS al resolutor de scopes: sin
eso, un tema que distingue `comment.line` de `comment.block` los pintaba igual,
porque la tabla por defecto manda todo `comment*` al mismo slot. Ahora
`themeTokenRules.ts` empuja cada selector del tema con su score, así que a igual
selector gana el tema y a mayor especificidad gana el del tema. Lo que NO viaja
todavía son los `fontStyle` (el `LineStyle` del motor es sólo color).

### Panel "Inspeccionar tokens" (`editor.inspectTokens`)

El slot no dice quién se equivocó. El panel muestra, por archivo y por FUENTE (en
orden de prioridad, con la que pisa marcada), el scope stack de cada token, el
slot al que resolvió y el color que el tema le dio — con resumen agrupado por
scope y la lista cruda de tokens. La procedencia la guarda `highlightSnapshot.ts`
(una entrada por fuente: el LSP y la gramática conviven en el mismo archivo y con
una sola entrada se borraban el rastro mutuamente). Se abre desde la paleta o
desde Ajustes → Resaltado.

### Tree-sitter dinámico: un `.wasm` de terceros, en su propio proceso

Un paquete SEF puede traer su parser (`grammars/x.wasm`) y sus queries `.scm`. Eso
es más preciso que un `.tmLanguage`: el árbol de sintaxis sabe que ese `*` es
multiplicación y no un puntero. El precio es ejecutar un binario de terceros, así
que va en un **`utilityProcess` aparte** (`tree-sitter/manager.ts`):

- **timeout por pedido** (10 s) y si se cuelga se MATA el proceso — un wasm
  colgado dentro del main se lleva la ventana;
- **apagado por inactividad** (1 min): la mayoría de las sesiones no abre un
  lenguaje dinámico y no carga con un proceso vivo;
- **jail de rutas** (parser y queries dentro de `userData/extensions`) y
  **sha256 obligatorio cuando el paquete lo declara** — el hash es lo que
  convierte "confío en el paquete que instalé" en algo verificable;
- **ABI**: se compara la declarada con la real y se AVISA (no se falla: un parser
  de otra ABI muchas veces parsea y produce nodos que las queries ya no conocen).

Las dos fuentes tienen la misma prioridad en el merge, así que publicar por las
dos sería no poder decidir quién manda. Quién gana **lo elige el usuario** en
Ajustes → Resaltado (`editor.grammarEngine`), porque no hay una respuesta
correcta para todos: `auto` (default) le da prioridad a TextMate —el camino que
usan las extensiones de VS Code—, `treeSitter` al árbol siempre que haya uno
usable (un `.tmLanguage` no puede saber que ese `*` es una multiplicación) y
`textMate` no levanta el proceso del parser. La decisión vive en UN solo lugar
(`grammarSelection.ts`) y los dos puentes la consultan: el que no gana no publica
nada. Si el lenguaje elegido no tiene esa gramática, se cae a la otra (nunca se
deja el archivo sin color porque sí) y el motivo sale en el log de diagnóstico.

#### El hallazgo que casi rompe todo (medido, no supuesto)

La documentación de tree-sitter habla de offsets en BYTES, así que lo natural es
codificar a UTF-8 y traducir cada índice a columna UTF-16. **Eso descoloca el
color** a partir del primer carácter multibyte: el binding de `web-tree-sitter`
pasa el texto con `(i) => texto.slice(i)`, o sea que su espacio de índices son
unidades UTF-16 aunque los docs digan "bytes". Medido con el parser real de
JavaScript:

```
`const a = "😀"`  → la captura de string es [10, 14]   (4 unidades UTF-16)
`const a = "ab"`  → [10, 14]
(en bytes, la primera sería [10, 16] → todo lo que sigue, corrido)
```

Por eso `scopes.ts` NO convierte: usa el índice del parser tal cual, que ya está
en la unidad de la línea del editor (y lo recorta si un parser devuelve un rango
más largo que el texto).

### 12.5 Los datos del árbol (no sólo color)

El tokenizador devolvía **sólo** color: cargaba `tags.scm`, `folds.scm`,
`locals.scm`… y las ignoraba con un `if (category !== 'highlights') continue`.
O sea: se pagaba el costo de leer y compilar esas queries para tirar su dato —el
árbol sabe dónde está cada función, qué se pliega y a qué definición apunta cada
variable, y nada de eso llegaba a la UI. Ahora el pedido viaja con TODAS las
categorías y la respuesta trae, en una sola pasada:

| Query | Dato | Quién lo consume |
| --- | --- | --- |
| `highlights.scm` | tokens (scope + slot) | `hostTokens` → `SetInnertaSemanticTokens` |
| `tags.scm` | símbolos anidados | panel **Esquema** (`services/extensions/dynamicSyntax.ts`) |
| `folds.scm` | rangos plegables | motor: `SetInnertaFoldingRanges` (chevrons del gutter), con estado leído de vuelta con `GetInnertaFoldingCount` / `GetInnertaFoldingIsHost` / `GetInnertaFoldingFromEngine` |
| `injections.scm` | tramos de otro lenguaje | se re-tokenizan en el MISMO pedido con el parser del lenguaje inyectado |
| `locals.scm` | definiciones y referencias con su ámbito | **Ir a la definición** (`treeNavigationLogic.resolveDefinition`) |
| `textobjects.scm` | rangos de función/clase/parámetro | **Expandir selección** (`SetInnertaSelection`) |
| `indents.scm`, `unknown` | — | se cargan y se reportan; todavía no hay consumidor (ver Límites) |

**La convención de cada query es el contrato** y por eso está en un módulo propio
(`treeSitter/queryData.ts`), puro y testeado: los símbolos salen de `@definition.X`
con un `@name` adentro (o del texto del propio capture si la gramática captura el
identificador), el plegado de `@fold[.kind]`, las inyecciones del `#set!
injection.language` (o del texto de un `@injection.language`, que es el caso de
los heredocs) y los alcances de `@local.definition` / `@local.reference` / `@local.scope`.

Dos detalles que costaron un bug cada uno:

1. **El fin de un rango es EXCLUSIVO.** Si se calcula con `positionAt(end)`, un
   nodo que termina justo en un salto de línea reporta la línea siguiente: una
   función de 4 líneas se veía de 5 y su plegado se comía la línea en blanco de
   abajo. Se calcula desde el ÚLTIMO CARÁCTER capturado.
2. **Un rango de una línea no se pliega** y se descarta; y si dos queries
   capturan la MISMA línea de inicio, gana el rango más grande (plegar la línea
   de arriba esconde el bloque, no su cabecera).

El plegado es hostil a equivocarse de a poco: `FoldingManager::UpdateRanges` corre
en cada cambio de buffer y **pisa** los rangos, así que ahora tiene un modo host
(`SetHostRanges`/`ClearHostRanges`): mientras el host tenga rangos del árbol, la
heurística de indentación no los toca (una tecla desplegaría todo el archivo).
Mandar una lista VACÍA es la orden de volver a la indentación, y es lo que hace el
puente al abrir otro archivo.

### 12.6 El CLI resuelve las queries que el repo NO publica

Lo medido sobre los 18 lenguajes del motor: `folds.scm` **0/18**, `indents` 0/18,
`textobjects` 0/18, `locals` 4/18, `injections` 7/18. No era un olvido del CLI:
es lo que publica cada repo de parser. Y no fallaba con un error, fallaba con un
SILENCIO: el paquete se instalaba sin `folds.scm` y el editor plegaba por
sangría sin que nadie supiera por qué.

`tools/grammar.mjs` ahora resuelve **por categoría** y reporta el resultado:

1. **ajuste propio** — `deps/queries-overrides/<símbolo>/<categoría>.scm`, que es
   lo que el engine ya sabe aplicar (`applyQueryOverrides` pisa o agrega);
2. **repo del parser** (upstream);
3. **suplemento** — nvim-treesitter **fijado por commit** (Apache-2.0), que es
   donde vive el catálogo supplementary real. Se guarda en el directorio de
   ajustes: la próxima corrida no necesita red y el MISMO archivo sirve para el
   paquete SEF y para el engine embebido (una sola fuente de verdad).

Lo que gana cada categoría queda en el `grammar.json` del paquete con su
procedencia (`source`, `origin`, `ref`, `license`, `sha256`) y las que no se
pudieron traer se declaran en `missingCategories` — el IDE cae a su alternativa y
queda constancia de que fue a propósito. `--verify` corre las queries y **un
categoría con 0 captures es un error de instalación**, no un aviso. Flags:
`--categories`, `--supplement none|nvim`, `--supplement-ref`, `--overrides`,
`--verify`.

Modo `--target engine`: copia las fuentes (lista negra de lo que el build en C no
usa — y no "sólo `src/`", porque varios monorepos incluyen hermanos del parser),
anota los suplementos en `deps/queries-overrides/<símbolo>/` y, con `--build`,
regenera los fragmentos del wasm (`tools/tui /build-wasm`) y recompila con
`emscripten/build-wasm.sh`, que ya deja `innerta.wasm`/`innerta.js` en
`src/renderer/public/innerta/`.

### 12.7 El motor también lee `folds.scm` (lenguajes de fábrica)

Hasta aquí el plegado por árbol sólo llegaba por el host (`SetInnertaFoldingRanges`,
que es el camino de la gramática dinámica y del `.sef`). Un lenguaje EMBEBIDO no
tiene host que le empuje nada, así que plegaba por indentación aunque el árbol
supiera dónde empieza y termina cada bloque.

`SyntaxHighlighter::CollectFoldRanges()` corre `folds.scm` sobre el árbol que dejó
el resaltado (mismo frame, sin parsear dos veces) y `EditorWindow` lo aplica:

- **quién manda**: el host, en SU lenguaje (una gramática dinámica gana sobre la
  embebida). El motor no gana ni se queda mudo por un push viejo: la propiedad se
  anota por lenguaje y el host la suelta al mandar una lista vacía;
- **y el `[]` del host devuelve el plegado al motor, no a la indentación**: el
  IDE manda la lista vacía al abrir un archivo (`startHighlightPipelines`), y ese
  clear llegaba DESPUÉS del primer pintado — borraba los rangos del `folds.scm`
  embebido y no había nada que los recalculara hasta una tecla, así que un
  lenguaje de fábrica plegaba por indentación para siempre. Ahora ese `[]` pide un
  resaltado nuevo, y el próximo Paint vuelve a correr la query del árbol;
- **el dato**: sólo líneas (`startLine` + 1 .. `endLine`, el mismo contrato que el
  host) y el `kind` por sufijo del capture (`@fold.comment` → 1, `@fold.imports`
  → 2, resto 0), igual criterio que `foldKindCode` del lado TS. Las directivas
  `(#set! fold.kind …)` de nvim se ignoran a propósito: el motor no interpreta
  `#set!`;
- **sin query no se inventa nada**: a diferencia de `injections.scm`, no hay
  patrón por defecto (una query de plegado adivinada plegaría mal); sin
  `folds.scm` se sigue plegando por indentación, y el `nullptr` se cachea para no
  releer el disco en cada frame;
- **diagnóstico honesto**: `GetInnertaFoldingIsHost` respondía "no es
  indentación", que ahora tiene dos causas (gramática dinámica del host o el
  `folds.scm` embebido). `GetInnertaFoldingFromEngine` las distingue, así que la
  línea `[languages] …` ya no reporta como "del host" el plegado de un lenguaje
  de fábrica.

### Límites conocidos (dichos, no escondidos)
- **`file.saveAll`** devolvía siempre error (`{ ok }` vs `{ success }`) —
  corregido de paso, porque un formatter de lenguaje lo usa.
- **`tag`** es una entrada EXTRA de la leyenda (índice 23): el LSP no tiene
  `tag`, y sin ella una etiqueta HTML caía en el color de tipos. El espejo entre
  `legend.ts` (TS) y `SyntaxHighlighter::LspTokenTypeToSlot` (C++) es un contrato:
  el test `tests/syntax-legend.test.ts` lo verifica del lado TS.
- **Temas**: los `fontStyle` (italic/bold por scope) no viajan al motor: su
  `LineStyle` es sólo color. El dato no se pierde en el camino del host (el paint
  list ya lo modela) pero el canvas no lo pinta.
- **Tree-sitter dinámico**: `indents.scm` (y las queries `unknown`) se cargan y se
  reportan, pero su dato todavía no tiene consumidor: la indentación al apretar
  Enter la decide el motor, y para cambiarla hace falta un canal nuevo
  (`SetInnertaIndentRules`) que no existe.
- **Inyecciones dinámicas**: el tramo se re-tokeniza sólo si el lenguaje
  inyectado está instalado y tiene parser `.wasm`. Los lenguajes declarados en
  una `injections.scm` se leen al indexar la query (`injectionLanguagesOf`), así
  que no se mandan candidatos a ciegas.
- **Selección**: `expandSelection` recuerda el último rango por archivo (el motor
  sólo devuelve el TEXTO seleccionado, no el rango), así que un click manual en
  el medio reinicia el ciclo al objeto más chico.
- **Parser nativo** (`.so`/`.dll`): el schema lo declara, el manager lo exige
  explícito y el worker lo rechaza con el motivo correcto. Cargarlo necesita el
  proceso aislado con consentimiento que todavía no está.

### Cómo se prueba

```bash
# Unidades (rápido, sin red)
npx vitest run tests/syntax-legend.test.ts tests/language-tokenizer.test.ts \
               tests/language-highlight-map.test.ts tests/languages-translator.test.ts \
               tests/tree-sitter-scopes.test.ts tests/tree-sitter-manager.test.ts \
               tests/tree-sitter-query-data.test.ts tests/tree-navigation-logic.test.ts \
               tests/dynamic-syntax.test.ts \
               tests/highlight-snapshot.test.ts tests/theme-token-rules.test.ts

# Parser wasm REAL (el binario no se versiona: se baja el paquete que publica VS Code)
npm pack @vscode/tree-sitter-wasm@0.3.1 && tar xzf vscode-tree-sitter-wasm-0.3.1.tgz
SCRAKK_TS_PARSER=$PWD/package/wasm/tree-sitter-javascript.wasm npx vitest run tests/tree-sitter-tokenizer.test.ts

# Worker COMPILADO en Node (bundle de producción + runtime wasm + parser real)
npm run build && node tools/_probe-tree-sitter.mjs $PWD/package/wasm/tree-sitter-javascript.wasm

# App REAL: instala el .sef, tokeniza por IPC (utilityProcess) y verifica el PINTADO
node tools/_make-dynamic-sef.mjs $PWD/package/wasm/tree-sitter-javascript.wasm
xvfb-run -a node tools/_probe-dynamic-app.mjs
# Mismo archivo con y sin la extensión: los píxeles que pasan de gris a color
# son los tokens que pintó la extensión (ver docs/editor/screenshots.md)
node tools/_look-png.mjs /tmp/innerta-shots/editor-sin-extension.png \
                         /tmp/innerta-shots/editor-con-extension.png

tools/_make-openfile-vsix.mjs && node tools/_probe-language.mjs   # app compilada
```

El probe dinámico corre sobre Electron real y verifica, en este orden: que el
`.sef` se instale; que `tokenizeDynamic` responda con tokens y scopes (o sea que
el `utilityProcess` levante, reciba el pedido y conteste); que un pedido con las
SEIS categorías devuelva símbolos anidados, plegado, alcances (con su ámbito),
objetos de texto y una inyección de CSS; que un sha256 que no coincide se rechace
ANTES de ejecutar el wasm; que abrir el archivo pinte los píxeles de gris a color
y que el panel **Esquema** muestre el símbolo del ÁRBOL; y que el ajuste de motor
de gramática apague y vuelva a encender el árbol sin reabrir el archivo.

Y desde la última pasada el probe **maneja la app** en lugar de mirar el store,
porque que el dato haya llegado no prueba que el usuario pueda usarlo:

- **F12 sobre una referencia** → la statusbar queda en `Ln 8, Col 10`: la
  DEFINICIÓN de `saludar`, resuelta con `locals.scm` (y en la columna del
  identificador, no en la del `function`).
- **Shift+Alt+→** → se captura antes/después y se comparan los píxeles del
  canvas; y para que no quede duda de QUÉ se seleccionó, **Ctrl+C y se lee el
  portapapeles**: `"function saludar(nombre) {\n  return nombre\n}"`, que es
  exactamente el objeto `function.outer` que declaró el árbol. Una segunda
  pulsación ya no tiene objeto más grande y el comando LO DICE.
- **Click en el chevron del gutter** → el bloque se pliega: la captura lo
  muestra (las líneas del cuerpo desaparecen). Para clickear donde hay que
  clickear, el probe **calibra la geometría del editor contra la statusbar**
  (barrido de clicks y ajuste de alto de línea, origen del texto y ancho de
  carácter, con verificación de residuos): nada de asumir el layout, y con dos
  puntos no alcanza — el redondeo del `floor` hacía creer que la línea medía
  17.2px cuando medía 16.

El plegado es lo único que no se puede leer del DOM, y su evidencia es la línea
de diagnóstico del puente:

```
[languages] dynjs: 13 tokens · 4 símbolos · folds: 2 en el motor, del host (aplicados) · 6 locales · …
```

`2 en el motor, del host` sale del CONTADOR DEL PROPIO MOTOR
(`GetInnertaFoldingCount` / `GetInnertaFoldingIsHost`, ahora expuestos en el
loader): dice cuántos rangos tiene adentro y que son los del host, no los de la
heurística de indentación. Es a propósito que no alcance con "la llamada no
lanzó": `setFoldingRanges` es `void`, y dar por bueno un `void` sin lanzar es
exactamente el verde falso que hace buscar el bug en el lugar equivocado.

Como control desinstala la extensión y vuelve a capturar: si los conteos no
bajan, la métrica está mintiendo (fue exactamente lo que pasó con la primera
versión del chequeo, que medía el color del wallpaper).

El último probe instala el VSIX real de Gleam, verifica el manifest traducido,
tokeniza la GRAMÁTICA REAL, comprueba el round-trip del canal del motor en el WASM
compilado, abre el archivo por una extensión y mide los píxeles del editor para
confirmar que hay **color de token** (no sólo texto gris).

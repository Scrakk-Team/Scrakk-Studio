; Parse the contents of tagged template literals using
; a language inferred from the tag.

(call_expression
  function: [
    (identifier) @injection.language
    (member_expression
      property: (property_identifier) @injection.language)
  ]
  arguments: (template_string (string_fragment) @injection.content)
  (#set! injection.combined)
  (#set! injection.include-children))


; Parse regex syntax within regex literals

((regex_pattern) @injection.content
 (#set! injection.language "regex"))

 ; Parse JSDoc annotations in comments

((comment) @injection.content
 (#set! injection.language "jsdoc"))

; Parse Ember/Glimmer/Handlebars/HTMLBars/etc. template literals
; e.g.: await render(hbs`<SomeComponent />`)
(call_expression
  function: ((identifier) @_name
             (#eq? @_name "hbs"))
  arguments: ((template_string) @glimmer
              (#offset! @glimmer 0 1 0 -1)))

; ── heredado de la base ──
; Inyecciones de TypeScript = las de JavaScript.
;
; El upstream de `tree-sitter-typescript` NO publica `injections.scm`: da por
; sentado que quien lo consume junta la base de JavaScript (nvim-treesitter y
; compañía lo hacen con `; inherits:`). Sin este archivo, TypeScript no tiene
; inyecciones y las plantillas etiquetadas (`` sql`…` ``, `` css`…` ``), los
; literales de regex y los comentarios JSDoc quedan sin parsear.
;
; En vez de copiar la query de JS (que se desincronizaría), se declara la
; herencia: el motor la resuelve al cargar. `inherits:` se lee SÓLO de la
; cabecera (primeras líneas, todas comentarios).
;
; Ver `deps/queries-overrides/README.md`.
; `inherits:` es una convención que el motor lee de la CABECERA del archivo.

; ── heredado de la base ──
; Inyecciones de TSX = las de TypeScript (que a su vez hereda las de JavaScript).
;
; La gramática de TSX es la de TypeScript + JSX: los mismos nodos de plantilla
; etiquetada, regex y JSDoc. El motor resuelve la cadena completa:
; tsx → typescript → javascript.
;
; Ver `deps/queries-overrides/README.md`.
; `inherits:` es una convención que el motor lee de la CABECERA del archivo.


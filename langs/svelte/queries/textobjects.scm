(element) @function.outer

(element
  (start_tag)
  .
  (_) @function.inner
  .
  (end_tag))

(attribute_value) @attribute.inner

(attribute) @attribute.outer

(element
  (start_tag)
  _+ @function.inner
  (end_tag))

(script_element) @function.outer

(script_element
  (start_tag)
  .
  (_) @function.inner
  .
  (end_tag))

(style_element) @function.outer

(style_element
  (start_tag)
  .
  (_) @function.inner
  .
  (end_tag))

((element
  (start_tag
    (tag_name) @_tag)) @class.outer
  (#match? @_tag "^(html|section|h[0-9]|header|title|head|body)$"))

((element
  (start_tag
    (tag_name) @_tag)
  .
  (_) @class.inner
  .
  (end_tag))
  (#match? @_tag "^(html|section|h[0-9]|header|title|head|body)$"))

((element
  (start_tag
    (tag_name) @_tag)
  _+ @class.inner
  (end_tag))
  (#match? @_tag "^(html|section|h[0-9]|header|title|head|body)$"))

(comment) @comment.outer

; ── heredado de la base ──

; Svelte-specific text objects
; based on grammar defined at
; https://github.com/tree-sitter-grammars/tree-sitter-svelte
; if block
(if_statement) @block.outer @conditional.outer

(if_statement
  (if_start)
  .
  _+ @block.inner @conditional.inner
  .
  (if_end))

; each block
(each_statement) @block.outer @loop.outer

(each_statement
  (each_start)
  .
  _+ @block.inner @loop.inner
  .
  (each_end))

; key block
(key_statement) @block.outer

(key_statement
  (key_start)
  .
  _+ @block.inner
  .
  (key_end))

; await block
(await_statement) @block.outer

(await_statement
  (await_start)
  .
  _+ @block.inner
  .
  (await_end))

; snippet block
(snippet_statement) @block.outer

(snippet_statement
  (snippet_start)
  .
  _+ @block.inner
  .
  (snippet_end))

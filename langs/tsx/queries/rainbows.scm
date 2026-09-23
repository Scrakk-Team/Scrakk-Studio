[
  (export_clause)
  (named_imports)
  (statement_block)
  (for_statement)
  (for_in_statement)
  (switch_body)
  (catch_clause "(" ")")
  (parenthesized_expression)
  (object)
  (object_pattern)
  (array)
  (array_pattern)
  (subscript_expression)
  (template_substitution)
  (arguments)
  (class_body)
  (formal_parameters)
  (computed_property_name)
] @rainbow.scope

[
  "(" ")"
  "${" "{" "}"
  "[" "]"
] @rainbow.bracket

(regex "/" @rainbow.bracket) @rainbow.scope

; ── heredado de la base ──

[
  (import_require_clause)
  (enum_body)
  (lookup_type)
  (parenthesized_type)
  (object_type)
  (type_parameters)
  (index_signature)
  (array_type)
  (tuple_type)
] @rainbow.scope

(type_arguments ["<" ">"] @rainbow.bracket) @rainbow.scope

[
  "{|" "|}"
] @rainbow.bracket

; ── heredado de la base ──
; inherits: jsx

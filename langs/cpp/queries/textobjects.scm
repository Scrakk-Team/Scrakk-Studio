(declaration
  declarator: (function_declarator)) @function.outer

(function_definition
  body: (compound_statement)) @function.outer

(function_definition
  body: (compound_statement
    .
    "{"
    _+ @function.inner
    "}"))

(struct_specifier
  body: (_) @class.inner) @class.outer

(enum_specifier
  body: (_) @class.inner) @class.outer

; conditionals
(if_statement
  consequence: (compound_statement
    .
    "{"
    _+ @conditional.inner
    "}")) @conditional.outer

(if_statement
  alternative: (else_clause
    (compound_statement
      .
      "{"
      _+ @conditional.inner
      "}"))) @conditional.outer

(if_statement) @conditional.outer

(if_statement
  condition: (_) @conditional.inner
  (#offset! @conditional.inner 0 1 0 -1))

(while_statement
  condition: (_) @conditional.inner
  (#offset! @conditional.inner 0 1 0 -1))

(do_statement
  condition: (_) @conditional.inner
  (#offset! @conditional.inner 0 1 0 -1))

(for_statement
  condition: (_) @conditional.inner)

; loops
(while_statement) @loop.outer

(while_statement
  body: (compound_statement
    .
    "{"
    _+ @loop.inner
    "}")) @loop.outer

(for_statement) @loop.outer

(for_statement
  body: (compound_statement
    .
    "{"
    _+ @loop.inner
    "}")) @loop.outer

(do_statement) @loop.outer

(do_statement
  body: (compound_statement
    .
    "{"
    _+ @loop.inner
    "}")) @loop.outer

(compound_statement) @block.outer

(comment) @comment.outer

(call_expression) @call.outer

(call_expression
  arguments: (argument_list
    .
    "("
    _+ @call.inner
    ")"))

(return_statement
  (_)? @return.inner) @return.outer

; Statements
;(expression_statement ;; this is what we actually want to capture in most cases (";" is missing) probably
;(_) @statement.inner) ;; the other statement like node type is declaration but declaration has a ";"
(compound_statement
  (_) @statement.outer)

(field_declaration_list
  (_) @statement.outer)

(preproc_if
  (_) @statement.outer)

(preproc_elif
  (_) @statement.outer)

(preproc_else
  (_) @statement.outer)

(parameter_list
  "," @parameter.outer
  .
  (parameter_declaration) @parameter.inner @parameter.outer)

(parameter_list
  .
  (parameter_declaration) @parameter.inner @parameter.outer
  .
  ","? @parameter.outer)

(argument_list
  "," @parameter.outer
  .
  (_) @parameter.inner @parameter.outer)

(argument_list
  .
  (_) @parameter.inner @parameter.outer
  .
  ","? @parameter.outer)

(number_literal) @number.inner

(declaration
  declarator: (init_declarator
    declarator: (_) @assignment.lhs
    value: (_) @assignment.rhs) @assignment.inner) @assignment.outer

(declaration
  type: (primitive_type)
  declarator: (_) @assignment.inner)

(expression_statement
  (assignment_expression
    left: (_) @assignment.lhs
    right: (_) @assignment.rhs) @assignment.inner) @assignment.outer

; ── heredado de la base ──

(class_specifier
  body: (_) @class.inner) @class.outer

(field_declaration
  type: (enum_specifier)
  default_value: (initializer_list) @class.inner) @class.outer

(for_range_loop) @loop.outer

(for_range_loop
  body: (compound_statement
    .
    "{"
    _+ @loop.inner
    "}"))

(template_declaration
  (function_definition)) @function.outer

(template_declaration
  (struct_specifier)) @class.outer

(template_declaration
  (class_specifier)) @class.outer

(lambda_capture_specifier
  "," @parameter.outer
  .
  (_) @parameter.inner @parameter.outer)

(lambda_capture_specifier
  .
  (_) @parameter.inner @parameter.outer
  .
  ","? @parameter.outer)

(template_argument_list
  "," @parameter.outer
  .
  (_) @parameter.inner @parameter.outer)

(template_argument_list
  .
  (_) @parameter.inner @parameter.outer
  .
  ","? @parameter.outer)

(template_parameter_list
  "," @parameter.outer
  .
  (_) @parameter.inner @parameter.outer)

(template_parameter_list
  .
  (_) @parameter.inner @parameter.outer
  .
  ","? @parameter.outer)

(parameter_list
  "," @parameter.outer
  .
  (optional_parameter_declaration) @parameter.inner @parameter.outer)

(parameter_list
  .
  (optional_parameter_declaration) @parameter.inner @parameter.outer
  .
  ","? @parameter.outer)

(initializer_list
  "," @parameter.outer
  .
  (_) @parameter.inner @parameter.outer)

(initializer_list
  .
  (_) @parameter.inner @parameter.outer
  .
  ","? @parameter.outer)

(new_expression
  (argument_list) @call.inner) @call.outer

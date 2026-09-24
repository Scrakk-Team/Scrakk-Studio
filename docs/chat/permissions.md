---
title: "Modos y permisos"
group: chat
order: 10
summary: "Dos piezas deciden qué puede hacer la IA: modos (un preset de efectos) y reglas (permitir / preguntar / negar por herramienta). Se combinan en el policy-engine para cada tool call."
---
# Modos y permisos

Dos piezas deciden qué puede hacer la IA: **modos** (un preset de efectos) y
**reglas** (permitir / preguntar / negar por herramienta). Se combinan en el
`policy-engine` para cada tool call.

## Modos

Un modo define cómo se tratan las ediciones, el shell y las confirmaciones.

### Integrados

| Id | Qué hace |
|---|---|
| `default` | Pregunta por ediciones y shell. |
| `plan` | Solo lectura: bloquea mutaciones y shell. |
| `acceptEdits` | Autoaprueba ediciones; el shell igual pregunta. |
| `auto` | Heurístico: aprueba lo seguro/rutinario, pregunta lo dudoso. |
| `dontAsk` | Nunca pregunta: lo que pediría confirmación se niega. |
| `bypassPermissions` | Aprueba todo (con cuidado). |

`auto_edit` y `all_allow` son alias históricos que no se listan.

### Modos propios

Se crean desde **Ajustes → Chat → Modos** partiendo de un integrado, y se
guardan en `.scrakk/modes.json` (usuario y proyecto; el proyecto gana por id).

```json
{
  "modes": [
    {
      "id": "shell-segura",
      "label": "Shell segura",
      "description": "Pregunta antes de tocar el shell.",
      "color": "#22c55e",
      "base": "default",
      "overrides": {
        "mutationBehavior": "auto",
        "shellBehavior": "never",
        "promptPolicy": "ask",
        "toolFilter": { "exclude": ["execute_command"] }
      },
      "prompt": "..."
    }
  ]
}
```

- `base`: cualquier modo integrado del que se hereda.
- `overrides`: lo que se cambia (`mutationBehavior`, `shellBehavior`,
  `promptPolicy`, `acceptEdits`, `bypassPermissions`, `toolFilter`).
- `toolFilter.exclude`: herramientas que **no existen** en ese modo (no se
  anuncian al modelo y el executor las niega).
- `toolFilter.include`: si está, solo esas herramientas existen.

Los ids no pueden colisionar con un modo integrado.

## Reglas

En `.scrakk/permissions.json` (usuario y proyecto, gana el proyecto). Cada
regla es un string con la sintaxis del CLI/Claude, o un objeto para acotarla a
modos.

```json
{
  "permissions": {
    "allow": ["Read(src/**)", "Bash(npm run *)"],
    "ask": ["Bash(git push:*)"],
    "deny": ["Read(**/.env)"],
    "defaultMode": "auto"
  },
  "modeRules": {
    "plan": { "deny": ["Bash(git push:*)"] },
    "acceptEdits": { "allow": ["Edit(src/**)"] }
  }
}
```

Precedencia **deny > ask > allow**, sin importar el orden. Las reglas globales
y las del modo activo se evalúan juntas. Un `deny` global es piso duro.

Sintaxis soportada: `Bash(...)`, `Read(...)`, `Edit(...)`, `Grep(...)`,
`WebFetch(domain:...)`, `WebSearch`, `MCPTool(...)`, o la herramienta sin
paréntesis para todas sus variantes. En paths, `*` no cruza `/` y `**` sí.

## Orden de resolución

1. Filtro de herramientas del modo (lo excluido se niega).
2. Reglas del usuario (globales + del modo activo).
3. Modo `auto`: heurístico.
4. `bypassPermissions`: aprueba.
5. Seguridad del shell (comandos peligrosos).
6. Comportamiento de mutación del modo.
7. Por defecto: permite.

---
title: "Modes and permissions"
group: chat
order: 10
summary: "Two pieces decide what the AI can do: modes (a preset of behaviors) and rules (allow / ask / deny per tool). They are combined in the policy engine for each tool call."
---
# Modes and permissions

Two pieces decide what the AI can do: **modes** (a preset of behaviors) and
**rules** (allow / ask / deny per tool). They are combined in the
`policy-engine` for each tool call.

## Modes

A mode defines how edits, the shell and confirmations are handled.

### Built-in

| Id | What it does |
|---|---|
| `default` | Asks for edits and **every** shell command (fail-closed). |
| `plan` | Read-only: blocks mutations and the shell. |
| `acceptEdits` | Auto-approves edits; the shell still asks (fail-closed). |
| `auto` | Heuristic: approves routine commands, asks about everything else. |
| `dontAsk` | Never asks: whatever would need confirmation is denied. |
| `bypassPermissions` | Approves everything (careful). |

`auto_edit` and `all_allow` are historical aliases that are not listed.

### Custom modes

Created from **Settings → Chat → Modes** starting from a built-in one, and stored
in `.scrakk/modes.json` (user and project; the project wins by id).

```json
{
  "modes": [
    {
      "id": "safe-shell",
      "label": "Safe shell",
      "description": "Asks before touching the shell.",
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

- `base`: any built-in mode to inherit from.
- `overrides`: what is changed (`mutationBehavior`, `shellBehavior`,
  `promptPolicy`, `acceptEdits`, `bypassPermissions`, `toolFilter`).
- `toolFilter.exclude`: tools that **do not exist** in that mode (they are not
  announced to the model and the executor denies them).
- `toolFilter.include`: if present, only those tools exist.

Ids cannot collide with a built-in mode.

## Rules

In `.scrakk/permissions.json` (user and project, the project wins). Each rule is
a string with the CLI/Claude syntax, or an object to scope it to modes.

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

Precedence is **deny > ask > allow**, regardless of order. Global rules and the
active mode's rules are evaluated together. A global `deny` is a hard floor.

Supported syntax: `Bash(...)`, `Read(...)`, `Edit(...)`, `Grep(...)`,
`WebFetch(domain:...)`, `WebSearch`, `MCPTool(...)`, or the tool without
parentheses for all its variants. In paths, `*` does not cross `/` and `**` does.

## Resolution order

1. The mode's tool filter (anything excluded is denied).
2. The user's rules (global + the active mode's).
3. `auto` mode: heuristic.
4. `bypassPermissions`: approves.
5. Shell safety (dangerous commands).
6. The mode's mutation behavior.
7. Default: allow.

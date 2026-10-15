---
title: "AI tools"
group: chat
order: 40
summary: "The built-in tools the agent can call: how they register, the family/type catalogue, per-tool policy, tool cards/visuals, and the list that exists today."
---
# AI tools

A **tool** is a function the model can call. Built-in tools live under
`src/renderer/src/services/ai/tools/<name>/`, register in one central
`ToolRegistry`, and run through `toolExecutor.ts`, which applies the policy
engine before touching the workspace. Extensions register tools with the same
shape (see [AI tools](../extensions/guides/tools.md)).

## Registration

Each tool folder exports a `Tool` (from `index.tsx`):

```ts
export interface Tool {
  name: string
  definition: ToolDefinition      // JSON schema the model receives
  permissions: PermissionRule[]
  meta?: ToolMeta                 // label, type, dangerLevel, icon, render card
  prompt?: string                 // fragment injected in the system prompt
  mutationBehavior?: 'always' | 'never' | 'shell'
  extensionId?: string
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult>
}
```

`registerAll()` in `tools/index.ts` registers the built-ins with
`allowOverwrite: true`. `ToolRegistry.register()` refuses to silently shadow an
existing name unless the caller opts in (`registry.ts`). `ToolContext` carries
`projectRoot` (read from `localStorage['scrakk-studio:root-path']`),
`sessionId`, an optional `signal` and the `toolCallId`.

## Families and types

`catalog.ts` groups tools in two levels — a `ToolFamily` contains `ToolType`s,
which contain tools:

| Family | Types |
| --- | --- |
| `environment` (Entorno) | `file`, `code`, `system`, `browser`, `skills`, `notes`, `utility` |
| `agentic` (Agénticos) | `subagent` |
| `extensions` (Extensiones) | `extension` |

The catalogue is extensible (`toolCatalog.registerFamily/registerType`,
`ensureType`); a tool without a `meta.type` falls back to `utility`
(`toolTypeOf`). What the model actually sees is filtered by
`getEnabledToolDefinitions(sessionId)`: global/session settings, the active
mode's `toolFilter.include/exclude`, and the removal of `task` when no subagent
is available. `withDynamicDescriptions()` rewrites the `task` description with
the live subagent list.

## Policy and permissions

Every call passes `policyEngine.checkTool(name, args)` in `executeRegistryTool`
before the tool runs. The decision is `deny`, `ask` (via `confirmationBus`) or
`allow`. Tools map to an access kind in `policy-engine.ts`:

| Tool(s) | Access kind |
| --- | --- |
| `execute_command` | `bash` |
| `read_file`, `read_multiple_files` | `read` |
| `write_file`, `append_file`, `replace_in_file`, `delete_file`, `move_file` | `edit` |
| `grep_search`, `file_search` | `grep` |
| `web_fetch` | `web_fetch` |
| `web_search` | `web_search` |

Each tool also declares its own rules in `permissions.ts`. Today:

- `read_file` → `path_block`, `size_limit`;
- `write_file`, `append_file`, `replace_in_file`, `delete_file`, `move_file` →
  `path_block`;
- `execute_command` → `command_prefix`;
- every other tool declares `[]`.

The user's `allow`/`ask`/`deny` rules apply through those access kinds, and the
mode's `mutationBehavior`/`shellBehavior` decide the rest. Enable/disable and the
approval mode are stored by `toolSettingsService` (`scrakk-studio:tool-settings`).

## Tool cards

Assistant messages render their calls with `ToolCallsBlock`, which reads the
real `meta` from the registry and mounts `ToolCallShell`. Each tool owns its
presentation in `visual/` (`meta.renderBody`, `meta.displayCss`,
`meta.headerArgKey`). Clicking a row opens the generic `ToolResultModal`, whose
body is the tool's `modal/` component when declared; otherwise it shows the
arguments and raw output. `meta.onOpen` changes the click: `'self'` for `task`,
or `openEditToolDiff` for the file-edit tools, which opens a diff tab from the
`originalContent`/`modifiedContent` pair carried in the result.

## Tools that exist today

Registered by `registerAll()` (23):

| Tool | Type | Danger | What it does |
| --- | --- | --- | --- |
| `read_file` | file | safe | Read a file (optional line range) |
| `read_multiple_files` | file | safe | Read several files at once |
| `list_directory` | file | safe | List a directory |
| `write_file` | file | medium | Create or overwrite a file |
| `append_file` | file | medium | Append to a file |
| `replace_in_file` | file | medium | Replace an exact string |
| `delete_file` | file | high | Delete a file |
| `move_file` | file | medium | Move or rename a file |
| `file_search` | code | safe | Search files by name |
| `grep_search` | code | safe | Search text within files (literal by default; `regex: true` for a regex) |
| `get_diagnostics` | code | safe | Read diagnostics for paths |
| `lsp` | code | safe | 19 LSP operations (definition, references, hover, symbols, rename, call hierarchy, diagnostics, …) |
| `execute_command` | system | high | Run a shell command |
| `adjust_timeout` | utility | low | Extend the current command timeout |
| `multiple_tools` | utility | medium | Run tools sequentially |
| `create_app_blueprint` | utility | safe | Create an app blueprint |
| `history_title` | utility | safe | Set the chat title |
| `list_skills` | skills | safe | List available skills |
| `skill` | skills | safe | Load a skill body by name |
| `notes` | notes | medium | List, read, create, update or delete the user's notes (scoped global/project, gated by per-note AI permissions) |
| `web_search` | browser | safe | Search the web (main, no CORS) |
| `web_fetch` | browser | safe | Fetch a URL as markdown (SSRF-guarded) |
| `task` | subagent | safe | Launch a subagent |

`execute_command`, `web_search` and `web_fetch` run in the main process over IPC;
`lsp` calls `@services/lsp`; `list_skills`/`skill` read `skillRegistry`.

## Limits

- The tool folders `open_browser`, `navigate_web`, `list_browser_tabs` and
  `view_web` have `definition.ts` and visuals in the tree, but `registerAll()`
  does **not** import them, so they are not exposed to the model today.
- The `size_limit` rule is declared and accepted, but `policy-engine.ts` returns
  `ALLOW` for it without comparing sizes.
- `read_multiple_files` is mapped to access with `args.files`, while its schema
  uses `paths`; user path rules therefore may not match it.
- A single tool call is capped at 90 s (`TOOL_TIMEOUT_MS` in
  `toolExecutor.ts`).
- Tools without an access mapping (e.g. `lsp`, `list_directory`, `task`,
  `notes`) are not covered by user allow/ask/deny rules. `notes` gates itself:
  it refuses to create/update/delete in a read-only (Plan) mode, and the
  per-note AI permissions are the real boundary.

## Next steps

- [Modes and permissions](permissions.md) — deny/ask/allow resolution.
- [AI tools for extensions](../extensions/guides/tools.md) — contributing a tool.
- [Skills](../extensions/guides/skills.md) — the `list_skills`/`skill` payloads.

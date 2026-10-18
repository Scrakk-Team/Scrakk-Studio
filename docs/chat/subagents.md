---
title: "Subagents"
group: chat
order: 50
summary: "How the task tool and the @agent mention launch an isolated subagent: its own session and chat, the runner, and how the result travels back to the parent."
---
# Subagents

A **subagent** is an agent with its own prompt, tool filter and model that the
parent agent runs in isolation. It does not see the parent conversation: its
`prompt` is the whole briefing. The parent gets back only its final text. There
are two entry points: the **`task` tool** (the model decides) and the
**`@agent <task>` mention** in the chat input (the user decides).

## Profiles and registry

The agent system unifies what used to be modes and subagents
(`src/renderer/src/services/ai/agents/`). An `AgentProfile` has `mode`
(`primary` | `subagent` | `all`), `prompt`, `model` (`inherit` by default),
`tools` (`include`/`exclude`), `permissions`, and an optional non-relaxable
`hardPermissions`. Profiles are parsed from `AgentEntry` objects stored in
`.scrakk/agents/primary.json` and `.scrakk/agents/subagents.json` (user layer
`~/.scrakk`, project layer wins per id).

`agentRegistry` keeps `primaries` and `subagents` separately.
`subagentsForMode(modeId)` returns:

- a primary's declared `subagents` when `modeId` is a custom primary agent;
- **all** registered subagents for a built-in mode (`default`, `plan`, …).

The first launch seeds a primary `asistente` and a read-only subagent
`explorador` (base `plan`, tools limited to `read_file`, `read_multiple_files`,
`list_directory`, `file_search`, `grep_search`, `get_diagnostics`). A subagent
can never re-invoke `task`: `resolveAgentEntry` sets
`hardPermissions.exclude = ['task']` for `mode: 'subagent'`.

## Launch through the `task` tool

`services/ai/tools/task/executor.ts` receives `subagent_type`, `prompt` and an
optional `description`:

```ts
const agent = agentRegistry.getSubagent(name)
const sessionId = startSubagentSession(agent, prompt, {
  signal: ctx.signal,
  sessionId: ctx.sessionId
})
linkToolCall(ctx.toolCallId, sessionId)      // so the card can open it
const session = await subagentSessions.waitFor(sessionId)
```

It then returns the **last assistant message with non-empty text** and the
session's `runId`. If the subagent failed with no text, the result is a failure
message with the error; otherwise the content is never empty (an empty tool
result made the parent re-call `task`).

## Launch through `@agent`

`ChatPanel.handleSend` matches `^@([A-Za-z0-9_-]+)\s+([\s\S]+)$`. If the id is a
known subagent, it appends the mention as a user message to the current session
and calls `spawnSubagentChat({ agentId, prompt, sessionId })`
(`features/chat/agents/spawn.tsx`), which creates the session and opens its chat
in a modal inside the chat panel. The chat input is locked while that modal is
open (`subagentSessions.isViewOpen()`), and the inline autocomplete lists
`subagentsForMode(getModeId())`.

## Its own session and chat

`SubagentSessionStore` (`agents/sessions.ts`) holds a `SubagentSession` per run:

```ts
interface SubagentSession {
  id: string
  agentId: string
  agentLabel: string
  prompt: string
  status: 'running' | 'done' | 'error'
  messages: ChatMessage[]
  error?: string
  startedAt: number
}
```

Stream deltas are buffered per segment and flushed on `requestAnimationFrame`,
mirroring the main chat. `SubagentChatView` renders that transcript with the same
`MessageList`/`MessageBubble` components but **without an input** — a subagent
does not receive follow-up messages. The `task` card (`TaskCard`) shows the last
line of output live and is clickable; clicking dispatches `subagent:open`, which
`SubagentOpenBridge` turns into `openSubagentChat`.

## The runner

`runHeadlessAgent` (`agents/runner.ts`) resolves the provider from
`activeProviderSelection()` (the API key is resolved by the main process from
`providerId`), then uses the agent model unless it is `inherit`, in which case
it uses the active model. Tool definitions
are the globally enabled ones filtered by the agent's `tools` and
`hardPermissions`. It streams with `api.llm.chatStream` and executes tool
calls with the real `executeTools` (so permissions still apply). The loop is
capped at `MAX_ROUNDS = 24`; the run stops early if its `signal` is aborted.

## How results come back

The final assistant text is the tool result that re-enters the parent's message
array as a `role: 'tool'` message. `linkToolCall` maps the parent's tool-call id
to the subagent session id, so `sessionIdForToolCall(toolCallId)` lets the card
open the live transcript even after the run finished. The parent's stream
continues from there.

## Limits

- A subagent is one-shot: no messages can be sent into it after it starts.
- No recursive subagents (`task` is excluded from subagents).
- The headless loop stops after 24 rounds; a longer run is truncated.
- The model is `inherit` unless the agent overrides it; there is no per-run model
  picker.
- Subagents share the active provider selection; the main resolves the API key
  by `providerId` (the renderer never sees it).

## Next steps

- [Modes and permissions](permissions.md) — how a subagent's filter interacts
  with the policy engine.
- [Skills](../extensions/guides/skills.md) — read-only workflows a subagent can
  load.
- [Slash commands](slash-commands.md) — other `/`-driven chat features.

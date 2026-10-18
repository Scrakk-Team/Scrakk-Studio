---
title: "AI chat"
group: chat
order: 30
summary: "The chat panel: sessions and persistence, the agentic stream loop, the model/mode/variant controls below the input, tool cards and message actions."
---
# AI chat

The chat panel is where the agent works. It lives in
`src/renderer/src/features/layout/panels/ChatPanel/ChatPanel.tsx`, reads and
writes sessions through `ChatsProvider`, and delegates the model call and tool loop
to `src/renderer/src/services/chat/chat.service.ts`; the fetch runs in main over IPC.

## Sessions and messages

`ChatsProvider` (`src/renderer/src/features/chat/state/ChatSessionsContext.tsx`)
owns the list of `ChatSession` objects and exposes:

- `createSession()`, `selectSession(id)`, `appendMessage(sessionId, message)`,
  `updateMessage(sessionId, messageId, updater)`,
  `removeMessagesAfter(sessionId, keepCount)`, `deleteSession(sessionId)`.

Sessions hydrate from localStorage at mount and persist with a debounced write
(`requestIdleCallback` with a 1 s timeout, `beforeunload` flush). A new session
is titled `Nuevo chat`; the **first user message names it** (first 48 chars), and
the `history_title` tool can rename it later by dispatching `set-chat-title`.

A `ChatMessage` (`src/renderer/src/services/chat/types.ts`) is:

```ts
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  reasoning?: string          // model reasoning, shown in the "Thought" block
  tool_calls?: ToolCallInfo[] // tools the assistant emitted
  tool_results?: Record<string, ToolResultInfo>
}
```

The **history view** is not a separate panel: the header button opens
`HistoryPanel` inside the chat column (and the skills view replaces it too). It
lists sessions by `updatedAt`, searches by title, and each row exports (via
`ChatExport`) or deletes the session.

## The stream loop

`createLlmChatService().sendMessage()` builds `system + history + user`, then
loops: each round streams once, executes any tool calls, feeds the results back,
and repeats until the model answers with no tool calls. Every round fires
`onRoundStart(round)`; the panel creates **one assistant segment per round**, so
reasoning, tool cards and text from consecutive rounds stay separate.

Deltas arrive through `api.llm.chatStream` (`llm:chat-stream-chunk`,
`-reasoning`, `-tool-calls`, `-done`, `-stopped`, `-error`). The panel does not
`setState` per token: it buffers deltas per segment and flushes once per frame.

```ts
const flushDeltas = (): void => {
  flushHandle = null
  if (pendingContent.size === 0 && pendingReasoning.size === 0) return
  const contentBySegment = new Map(pendingContent)
  const reasoningBySegment = new Map(pendingReasoning)
  pendingContent.clear()
  pendingReasoning.clear()
  for (const [id, delta] of contentBySegment) {
    patchSegment(id, (message) => ({ ...message, content: message.content + delta }))
  }
  for (const [id, delta] of reasoningBySegment) {
    patchSegment(id, (message) => ({ ...message, reasoning: (message.reasoning ?? '') + delta }))
  }
}
```

The "Detener" button aborts an `AbortController`, which calls
`api.llm.stopStream(requestId)`. The main process aborts the fetch and
emits `chatStreamStopped`, so the round resolves with the **partial** content
instead of failing. The main process also enforces an **inactivity** timeout:
`IDLE_TIMEOUT_MS = 120_000` (`src/main/ipc/llm.ts`) aborts if the provider sends
no byte for two minutes — a long generation is fine as long as data keeps
arriving. Tool-call deltas are deduped by `id` in both main and renderer, and
emitted incrementally (throttled ~50 ms) so the card appears while the model is
still typing.

## Controls below the input

The model picker, mode and variants live **below** the input in
`ChatPanel/ComposerFooter.tsx`. When the panel narrows, center controls collapse
into a "⋯" menu (thresholds: skills under 400 px, variants under 350 px, model
under 300 px):

| Control | Component | Behavior |
| --- | --- | --- |
| Mode | `ModeLabel` | Opens `modeRegistry.getAll()` menu; `applyMode(id)` |
| Skills | `SkillsButton` | `skills: N`, toggles the in-panel skills view |
| Variants | `VariantsButton` | Effort slider over the model's reasoning variants |
| Model | `ModelPicker` | Same menu as `useModelMenuItems()` |

`ModeGlow` and `EffortSparks` decorate the composer; the sparks turn on when the
active variant is the maximum step. The `ChatInput` autocompletes `/commands`
from `slashCommands.match()` and `@subagent` mentions from `subagentsForMode()`.
Enter sends, Shift+Enter inserts a newline.

## Tool calls and confirmations

Assistant messages with `tool_calls` render `ToolCallsBlock`, which resolves each
tool's `meta` from `registry` and mounts `ToolCallShell`. The shell delegates to
the tool's own `visual/` (`meta.renderBody`), falls back to a one-line label, and
decides what a click does from `meta.onOpen`:

- not declared → open `ToolResultModal` (args + output, or the tool's `modal/`);
- `'self'` → the tool handles the click (`task` opens the subagent chat);
- a function → the tool's handler (file-edit tools open a **diff tab**).

When the policy engine returns `ASK_USER`, `confirmationBus` shows
`ToolConfirmationModal`, anchored above the chat input (with the risky command
and its risk level). The choices are Approve, Always approve
(`setApprovalMode('all_allow')`) and Reject; closing it rejects.

## Commands view

Inputs starting with `/` are intercepted by `handleSend`, run through
`slashCommands.run(text, { source: 'chat', sessionId })`, and **never sent to the
model**. If the command returns `{ ui: true }` it drew its own UI and nothing is
appended; otherwise `result.message` (or the error) becomes an assistant message.
`registerChatCommands()` currently registers one command, `/variants`.

## Message actions

`MessageActions` (`features/chat/components/MessageActions`) offers:

- **Copy** — `navigator.clipboard.writeText`, with a 1.2 s check mark.
- **Edit** — user messages only, inline textarea; `Cmd/Ctrl+Enter` saves,
  `Escape` cancels. Editing a user message **discards everything after it** and
  resends with the new text. Editing the last question while the model is
  streaming aborts and awaits the in-flight stream first.
- **Regenerate** — removes the trailing assistant turn, re-sends the last user
  message with the history before it.
- **Jump to message** — only on the anchored (last) user message.

## Limits

- The agentic loop has **no round cap** in the chat; it stops only when the model
  answers without tools or the user hits Detener. Each individual tool call has a
  90 s hard limit in `toolExecutor.ts`.
- While a message streams, content is rendered as plain text; markdown is parsed
  once the round ends.
- Editing or regenerating drops the messages that followed — there is no undo.
- Only one stream runs at a time (`isBusy`); the input stays writable but send is
  blocked until it ends.
- A provider is required before sending; the main resolves the API key and the
  stream returns a localized error if it is missing.

## Next steps

- [Modes and permissions](permissions.md) — what the loop is allowed to execute.
- [Slash commands](slash-commands.md) — the `/` system used by the composer.
- [AI tools](../extensions/guides/tools.md) — how a tool reaches this panel.
- [SEF extensions](../extensions/README.md) — the area index.

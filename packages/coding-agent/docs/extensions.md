# Extensions

Extensions are TypeScript modules that add executable behavior to Pi — agent
tools, event handlers, context transformations. Use one when a workflow needs a
new operation rather than instructions alone.

A bot runs in the experimental harness, which implements a **subset** of the
extension API. This page documents that subset; treat anything else as
unavailable.

## What works in a bot

| Capability | Status |
|---|---|
| `pi.registerTool()` | Supported; extension tools are always active. |
| `pi.on(...)` for the events below | Supported. |
| `pi.setActiveTools()`, `pi.refreshTools()`, `pi.getAllTools()` | Supported. |
| `pi.setModel()`, `pi.getThinkingLevel()` | Supported (`setModel` still hits the service clamp). |
| `pi.registerProvider()` | Bound, but providers and credentials are service-managed — do not use it in a bot. |
| `pi.registerCommand()`, shortcuts, flags | Not surfaced; there is no extension command channel. |
| `pi.sendMessage()`, `pi.sendUserMessage()`, `pi.appendEntry()` | Not mapped. |
| `ctx.compact()`, `ctx.reload()`, `ctx.shutdown()` | Not mapped. |
| UI (`ctx.ui`, renderers, terminal components) | No terminal UI; nothing renders. |
| `provider_stream_event`, `user_bash`, session/tree events | Not mapped. |

Supported events: `session_start`, `before_agent_start` (mapped from the
harness's `before_run`), `context`, `tool_call`, `tool_result`,
`before_provider_request`.

Edits apply on commit, not on reload: the service stops your server, reconciles
and starts a fresh one. There is no `ctx.reload()`.

## Create and load an extension

An extension exports a default factory that receives `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "word_count",
    label: "Word count",
    description: "Count words in a file.",
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, { path }, _signal, _onUpdate, ctx) {
      // read the file, return { content: [...], details: {...} }
    },
  });
}
```

Place it at `<agent dir>/extensions/<name>/index.ts` (a directory with an
`index.ts`, or a single `.ts` file under `extensions/`), commit, and the next
restart loads it. pi uses `jiti`, so local TypeScript needs no build step. For
sharing, see [Pi Packages](packages.md) and [Registry](registry.md).

An extension runs inside the Pi process with the same operating-system
permissions. It can inspect prompts, tool calls, files, and session history —
load extensions only from sources you trust, and prefer the registry.

## Respect the runtime lifecycle

The factory can be synchronous or asynchronous. Do not start long-lived
processes, sockets, watchers, or timers in the factory, because the harness
loads extensions in contexts that never run a session. Start them from
`session_start` or from the handler that needs them, and release them where
they were created; `session_shutdown` is not among the supported events, so a
restart is the hard cleanup boundary.

## Work with events

Handlers run in registration order. `pi.on()` returns an unsubscribe function.
Some events notify; others transform data, replace results, or cancel an
operation — use each event's declared result type.

- `before_agent_start` exposes the prompt and its structured
  `systemPromptOptions` (including `customPrompt`, `behaviorPrompt`,
  `memoryPrompt`, `sections`, `selectedTools`). Prefer editing sections over
  forcing a whole prompt.
- `context` transforms conversation messages (without system messages).
- `tool_call` can mutate input or block execution; `tool_result` handlers
  compose.
- `before_provider_request` sees the provider payload last.

Slow handlers delay stream consumption for their event; keep them cheap.

## Tools

A tool defines a name, model-facing description, a TypeBox parameter schema,
and `execute()`. Its result needs model-facing `content` and a `details` field
(use `details: undefined` when there is nothing structured). Throw from
`execute()` to produce a failed result; returning an object does not mark an
error.

Register every tool at load; use `pi.setActiveTools()` for optional ones (names
must already be registered). Extension tools are active regardless of
`defaultTools` — the service floor guarantees the built-ins, and extension
tools join them.

Use sequential execution when tools share mutable state, and wrap complete
read-modify-write operations with `withFileMutationQueue()`. Truncate large
model-facing results and tell the model where the full output is.

## State

Keep branch-sensitive tool state in tool-result `details` and rebuild it from
`ctx.sessionManager.getBranch()` during `session_start`. There is no
`appendEntry` in a bot; state that must survive a restart belongs in files
under the agent dir (and, for durable knowledge, notes — see
[Memory](memory.md)).

## Errors and cleanup

Pi reports handler errors and continues where possible. A `tool_call` failure
blocks the tool as a fail-safe; a tool execution failure becomes an error
result for the model. Keep cleanup idempotent: restarts can converge on the
same path.

## Examples and reference

The checked [extension examples](../examples/extensions/) cover tools,
lifecycle events, state, and providers. Start with the smallest example
matching your integration point. Use [Pi Packages](packages.md) to distribute
an extension together with skills.

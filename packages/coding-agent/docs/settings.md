# Settings Reference

This reference lists settings, their types, defaults, and purposes. A bot's
settings live in `<agent dir>/settings.json`; there is no project scope (`.pi`
is inert). After editing, commit: the service restarts the server and the new
settings apply. See [Configuration](configuration.md) for file locations and
[Self-configuration](self-config.md) for what the service owns.

## Shadowed keys

`PI_ADMIN_SETTINGS` (the service admin layer) is merged after your settings and
wins where it applies:

| Key | Rule |
|---|---|
| `defaultProvider`, `defaultModel` | Service-owned; your values are ignored and `pi.models.select` is clamped. |
| `packages` | Union: mandatory packages (the base package plus deployment extras) always load. |
| `defaultTools` | Union floor: `read`, `write`, `edit`, `bash` are always active; extension tools are always active regardless. |

Everything below is yours unless noted.

## Model and thinking

| Setting | Type | Default | Description |
|---|---|---|---|
| `defaultThinkingLevel` | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| "max"` | `"medium"` | Startup thinking level. |
| `modelThinkingLevels` | object | None | Per-model startup thinking levels keyed by exact `provider/modelId`. |
| `thinkingBudgets` | object | Built-in budgets | Token budgets for `minimal`, `low`, `medium`, and `high` thinking levels. |
| `hideThinkingBlock` | boolean | `false` | Hide thinking blocks in the transcript. |
| `showCacheMissNotices` | boolean | `false` | Show notices for significant cache misses, successful cache warming, compaction usage, and provider recovery. |
| `cacheWarming` | `"off" \| "streaming" \| "idle"` | `"streaming"` | Keep eligible provider prompt caches warm during active runs or, with `"idle"`, between runs. Global setting only. |
| `enabledModels` | `string[]` | All available models | Model patterns used for startup selection. The model itself is service-enforced. |

The model and provider are fixed by the service; do not set
`defaultProvider`, `defaultModel`, or `enabledModels` to change them.

## Interaction

| Setting | Type | Default | Description |
|---|---|---|---|
| `steeringMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | How queued steering messages are delivered. |
| `followUpMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | How queued follow-up messages are delivered. |
| `externalEditor` | string | `$VISUAL`, `$EDITOR`, then platform default | Terminal-only; inert for bots. |
| `doubleEscapeAction` | `"tree" \| "fork" \| "none"` | `"tree"` | Terminal-only; inert for bots. |
| `treeFilterMode` | `"default" \| "no-tools" \| "user-only" \| "labeled-only" \| "all"` | `"default"` | Initial filter used by `/tree`. |
| `defaultProjectTrust` | `"ask" \| "always" \| "never"` | `"ask"` | Bots have no trusted project; leave as is. |

## Tools

| Setting | Type | Default | Description |
|---|---|---|---|
| `defaultTools` | `string[]` | `read`, `bash`, `edit`, `write` | Built-in tools enabled at startup, unioned with the service floor. An empty array disables all non-floor built-in tools but not extension tools. |

Available built-in tools are `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, and `ls`. The floor (`read`, `write`, `edit`, `bash`) cannot be removed.

## Sessions and context

| Setting | Type | Default | Description |
|---|---|---|---|
| `sessionDir` | string | Agent session directory | Session storage directory. Relative paths resolve from the working directory. `PI_CODING_AGENT_SESSION_DIR` and `--session-dir` override this setting. |

### Compaction

| Setting | Type | Default | Description |
|---|---|---|---|
| `compaction.enabled` | boolean | `true` | Enable automatic compaction. |
| `compaction.reserveTokens` | number | `16384` | Tokens reserved for the model response. |
| `compaction.keepRecentTokens` | number | `20000` | Recent tokens retained without summarization. |
| `compaction.modelOverrides` | object | None | Per-model token settings keyed by exact `provider/modelId`. |

Compaction token values must be non-negative safe integers. Each value resolves
independently from the matching model override, then the ordinary compaction
setting, then the built-in default. See [Compaction Reference](compaction.md)
for trigger, summarization, and validation behavior.

### Branch summaries

| Setting | Type | Default | Description |
|---|---|---|---|
| `branchSummary.reserveTokens` | number | `16384` | Tokens reserved when summarizing branch history. |
| `branchSummary.skipPrompt` | boolean | `false` | Skip the branch-summary prompt and default to no summary. |

## Presentation

The web client renders the transcript; terminal-oriented keys below are inert:

| Setting | Type | Default | Description |
|---|---|---|---|
| `theme` | string | `"system"` | Terminal-only; inert for bots. |
| `quietStartup` | boolean | `false` | Terminal-only; inert for bots. |
| `tuiMode` | `"regular" \| "fullscreen"` | `"regular"` | Terminal-only; inert for bots. |
| `fullscreenExitOutput` | `"transcript" \| "resume-hint"` | `"transcript"` | Terminal-only; inert for bots. |
| `fullscreenScrollbar` | `"auto" \| "always" \| "hidden"` | `"auto"` | Terminal-only; inert for bots. |
| `fullscreenCopyOnSelect` | boolean | `true` | Terminal-only; inert for bots. |
| `editorPaddingX` | number | `0` | Terminal-only; inert for bots. |
| `outputPad` | `0 \| 1` | `1` | Horizontal transcript padding. |
| `autocompleteMaxVisible` | number | `5` | Terminal-only; inert for bots. |
| `showHardwareCursor` | boolean | `false` | Terminal-only; inert for bots. |
| `terminal.*` | object | — | Terminal detection; inert for bots. |
| `images.autoResize` | boolean | `true` | Resize images to at most 2000 by 2000 pixels before sending them to a model. |
| `images.blockImages` | boolean | `false` | Prevent images from being sent to models. |
| `markdown.codeBlockIndent` | string | `"  "` | Prefix used to indent rendered code blocks. |
| `markdown.mermaid` | `"off" \| "final" \| "streaming"` | `"streaming"` | Mermaid rendering mode. |

## Network and retries

| Setting | Type | Default | Description |
|---|---|---|---|
| `transport` | `"auto" \| "sse" \| "websocket" \| "websocket-cached"` | `"auto"` | Preferred transport for AI providers that support multiple transports. |
| `httpProxy` | string | None | Proxy URL applied as `HTTP_PROXY` and `HTTPS_PROXY` for Pi-managed HTTP clients. **Can only be set in agent-directory settings.** |
| `httpIdleTimeoutMs` | number | `300000` | HTTP header and body idle timeout in milliseconds. Set to `0` to disable. |
| `websocketConnectTimeoutMs` | number | `15000` | WebSocket connection timeout in milliseconds. Set to `0` to disable. |
| `retry.enabled` | boolean | `true` | Enable automatic agent-level retry for transient failures. |
| `retry.maxRetries` | number | `3` | Maximum agent-level retry attempts. |
| `retry.baseDelayMs` | number | `2000` | Initial exponential-backoff delay in milliseconds. |
| `retry.maxAgentDelayMs` | number | `60000` | Maximum agent-level retry delay in milliseconds. |
| `retry.provider.timeoutMs` | number | `httpIdleTimeoutMs` | Provider request timeout in milliseconds. |
| `retry.provider.maxRetries` | number | `0` | Provider-level retry attempts. |
| `retry.provider.maxRetryDelayMs` | number | `60000` | Maximum server-requested delay in milliseconds. Set to `0` to disable the limit. |

Keep `retry.provider.maxRetries` at `0` unless provider-level retries are
required.

## Shell

| Setting | Type | Default | Description |
|---|---|---|---|
| `shellPath` | string | Platform default | Custom shell executable path. Supports a leading `~`. |
| `shellCommandPrefix` | string | None | Prefix prepended to every shell command. |
| `npmCommand` | `string[]` | `npm` | Command and arguments used for npm package lookup and installation. |

## Resources

Resource paths resolve from the agent directory. Absolute paths and `~` are
supported.

| Setting | Type | Default | Description |
|---|---|---|---|
| `packages` | array | `[]` | npm, git, or local Pi package sources, unioned with the service's mandatory set. See [Pi Packages](packages.md). |
| `extensions` | `string[]` | `[]` | Extension files or directories. |
| `skills` | `string[]` | `[]` | Skill files or directories. |
| `prompts` | `string[]` | `[]` | Prompt-template files or directories. |
| `themes` | `string[]` | `[]` | Theme files or directories. |
| `enableSkillCommands` | boolean | `true` | Register skills as `/skill:name` commands. |

Resource arrays support glob exclusions with `!pattern`, exact inclusion with
`+path`, and exact exclusion with `-path`.

## Service-owned

| Setting | Why |
|---|---|
| `lastChangelogVersion`, `collapseChangelog` | The service owns updates and the changelog. |
| `enableInstallTelemetry`, `enableAnalytics`, `trackingId` | The service decides installation telemetry. |
| `defaultProvider`, `defaultModel` | The model is enforced (see above). |

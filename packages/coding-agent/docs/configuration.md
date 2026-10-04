# Configuration

A bot's configuration lives in its agent directory — the bot directory itself
(`PI_CODING_AGENT_DIR`, for example `~/Bots/<name>`). There is no interactive
settings UI: you edit files and commit, and the service restarts the server
from the commit. See [Self-configuration](self-config.md) for the contract and
[Memory](memory.md) for how memory works.

## Agent directory

The agent directory is shown as `<agent-dir>` below. Set its location with the `PI_CODING_AGENT_DIR` environment variable or the SDK's [`agentDir`](sdk.md) option.

| Path | Responsibility |
|---|---|
| `settings.json` | Preferences, defaults, resource paths and package declarations. Service-managed keys are shadowed — see below. |
| `SOUL.md` | Identity, voice, values, boundaries. Becomes the prompt preamble. |
| `BEHAVIOR.md` | Always-on working rules. Becomes the `<behavior>` section. |
| `extensions/` | Your extensions (a subset of the API works — see [Extensions](extensions.md)). |
| `skills/` | Your skills; also load them from a registry package (see [Registry](registry.md)). |
| `models.json`, `models-store.json`, `auth.json`, `trust.json` | Shared symlinks into the service's agent dir. Service-owned; do not edit. |
| `sessions/` | Session files (gitignored). |
| `AGENTS.md` | Optional instructions of your own; not scaffolded. `AGENTS.override.md` / `CLAUDE.md` behave as upstream. |
| `keybindings.json`, `themes/`, `prompts/` | Terminal-UI surfaces; there is no terminal UI. Leave them empty. |
| `SYSTEM.md`, `APPEND_SYSTEM.md` | Pi-native prompt files; not scaffolded for bots — identity comes from `SOUL.md` + `BEHAVIOR.md`. |

## Shadowed settings

`PI_ADMIN_SETTINGS` (written by the service into the bot dir) is merged after
your settings and wins where it applies:

- the model (`defaultProvider`, `defaultModel`) — fixed by the service;
- `packages` — the union; mandatory packages always come back;
- `defaultTools` — the union floor: `read`, `write`, `edit`, `bash` are always
  active, and extension tools are always active regardless.

Everything else in `settings.json` is yours, including `defaultThinkingLevel`,
compaction, retry and display preferences. See [Settings](settings.md).

## Project `.pi` directory

| Path | Responsibility |
|---|---|
| `.pi/settings.json` | Project-level [settings](settings.md), resource paths, and Pi package declarations. |
| `.pi/mcp.json` | Project [MCP servers](mcp.md). |
| `.pi/SYSTEM.md` | Replaces the system prompt for the project. |
| `.pi/APPEND_SYSTEM.md` | Adds project-specific instructions to the system prompt. |
| `.pi/extensions/` | Project extensions. |
| `.pi/skills/` | Project skills and supporting files. |
| `.pi/prompts/` | Project prompt templates exposed as slash commands. |
| `.pi/themes/` | Project theme files. |

For `SYSTEM.md` and `APPEND_SYSTEM.md`, the trusted project file takes precedence over the corresponding agent-directory file. Files with the same name are not combined.

## Context files

Context files are separate from project `.pi` configuration. Pi loads them from the agent directory, the working directory, and its parent directories. A context file applies whenever Pi runs in its directory or anywhere below it.

An `AGENTS.override.md` replaces `AGENTS.md` or `CLAUDE.md` only in the same directory. It does not suppress context files from the agent directory or other directories.

Context-file discovery does not require project trust.

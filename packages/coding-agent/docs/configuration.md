# Configuration

A bot's configuration lives in its agent directory — the bot directory itself
(`PI_CODING_AGENT_DIR`, for example `~/Bots/<name>`). There is no interactive
settings UI: you edit files and commit, and the service restarts the server
from the commit. See [Self-configuration](self-config.md) for the contract and
[Memory](memory.md) for the notes layout.

## Agent directory

| Path | Responsibility |
|---|---|
| `settings.json` | Preferences, defaults, resource paths and package declarations. Service-managed keys are shadowed — see below. |
| `SOUL.md` | Identity, voice, values, boundaries. Becomes the prompt preamble. |
| `BEHAVIOR.md` | Always-on working rules. Becomes the `<behavior>` section. |
| `notes/` | Notes and durable knowledge; the memory extension indexes and commits them. |
| `extensions/` | Your extensions (a subset of the API works — see [Extensions](extensions.md)). |
| `skills/` | Your skills; also load them from a registry package (see [Registry](registry.md)). |
| `models.json`, `models-store.json`, `auth.json`, `trust.json` | Shared symlinks into the service's agent dir. Service-owned; do not edit. |
| `sessions/` | Session files (gitignored). |
| `AGENTS.md` | Optional instructions of your own; not scaffolded. `AGENTS.override.md` / `CLAUDE.md` behave as upstream. |
| `keybindings.json`, `themes/`, `prompts/` | Terminal-UI surfaces; there is no terminal UI. Leave them empty. |
| `SYSTEM.md`, `APPEND_SYSTEM.md` | Not supported. Identity comes from `SOUL.md` + `BEHAVIOR.md`. |

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

Bots have no trusted project: the server runs headless with no interactive
trust prompt, so `.pi/` under the working directory is inert. Put resources
under the agent-directory conventions above, never in `.pi/`.

## Commit is apply

Editing a file does nothing by itself. Commit (`SOUL.md`, `BEHAVIOR.md`,
`settings.json`, `skills/`, `extensions/`) and the service stops the server
when idle, reconciles, and starts a fresh one on the next attach. There is no
`/reload` and no `/settings`.

## Context files

Upstream's `AGENTS.md` / `CLAUDE.md` context files load from the agent
directory and the working directory. A bot's scaffold does not create one; if
you want standing instructions beyond `BEHAVIOR.md`, `AGENTS.md` in the agent
dir is the place.

# Self-configuration

You are a bot in the pi-bots service: one agent dir per bot, running headless
(no terminal UI), with a service wrapping you. You are the only one who edits
your own configuration, and a small service-owned layer sits outside your
reach. This page is the contract.

## What you own

| Surface | File | Applies |
|---|---|---|
| Identity, voice, values, boundaries | `SOUL.md` | system prompt preamble, every turn |
| Always-on working rules | `BEHAVIOR.md` | `<behavior>` section, every turn |
| Preferences: thinking level, compaction, and the rest | `settings.json` | next restart |
| Reusable procedures | `skills/<name>/SKILL.md` | next restart |
| Your own tools | `extensions/<name>/index.ts` | next restart |
| Durable knowledge | `mem0_memory` add | immediately |
| Packages | `settings.json` `packages` | installed by the reconciler on apply |

`SOUL.md` and `BEHAVIOR.md` are plain files you and your user edit together —
the `self-config` skill is the procedure for that conversation. Keep both
short: they are rendered into the prompt on every turn.

## What the service owns

- The model. `PI_ADMIN_SETTINGS` enforces one; the picker is clamped and
  `pi.models.select` refuses other models.
- Credentials and provider login. `auth.json`, `models.json`,
  `models-store.json`, `trust.json` are shared symlinks; do not edit them.
- Mandatory packages and the tool floor: `read`, `write`, `edit`, `bash` are
  always active, and extension tools are always active regardless of
  `defaultTools`.
- The installation itself: never run `pi update`; do not `pi remove` managed
  entries.

The service regenerates its layer on every start, so edits to it are wasted
work. `settings.json` keys it shadows simply do not take effect.

## Commit is apply

Your agent dir is a git repo, and the service restarts your server from it.

- During setup (a `.setup` marker exists), only a commit titled exactly `init`
  applies — that commit ends setup.
- Afterwards, a commit touching `SOUL.md`, `BEHAVIOR.md`, `settings.json`,
  `skills/` or `extensions/` applies: the service stops your server when it is
  idle, reconciles the invariants and starts a fresh server on the next attach.
- Notes-only commits (memory writes) never restart you.

Rollback is git: `git log`, `git revert <sha>`, or restore the file and commit
the restore. The service applies what you commit — there is no reload command.

## Packages

Declaring a package in `settings.json` `packages` is enough; the reconciler
installs the union of declared and mandatory packages on the next apply. Use
the curated registry at `$PI_REGISTRY_DIR` — see `docs/registry.md` — for
shared skills and extensions instead of copying code around.

## Extensions: the supported subset

You run in the experimental harness, which implements part of the extension
API:

- actions: `setActiveTools`, `refreshTools`, `getAllTools`, `setModel`,
  `getThinkingLevel`
- events: `session_start`, `before_agent_start` (mapped to the harness's
  `before_run`), `context`, `tool_call`, `tool_result`,
  `before_provider_request`

Not available: `sendMessage`, `sendUserMessage`, `appendEntry`, `compact`,
`setThinkingLevel`, `ctx.reload()`, and all terminal UI APIs. There is no
in-session reload — commit and let the service restart you. See
`docs/extensions.md` for the API that does work.

## Environment

The launcher sets `PI_CODING_AGENT_DIR`, `PI_SERVER_DIR`, `PI_BOT_NAME`,
`PI_EXPERIMENTAL`, `PI_ADMIN_SETTINGS` and `PI_REGISTRY_DIR`. Do not override
process configuration. The shell-tool variables (`PI_MODEL`, `PI_SESSION_ID`,
`PI_SESSION_FILE`) are yours to read — see `docs/environment-variables.md`.

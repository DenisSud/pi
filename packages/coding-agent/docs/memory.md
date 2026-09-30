# Memory

Memory is a few files, not a database. It exists so future turns — yours and
other bots' — cost less reasoning.

## Layout

| Path | What |
|---|---|
| `<agent dir>/notes/` | your notes (frontmatter + body) |
| `<agent dir>/notes/index.md` | generated index; never edit it |
| `~/.pi/agent/memory/` | the shared notes repo, readable by every bot |
| `~/.pi/agent/memory/USER.md` | the shared user profile |
| `SOUL.md`, `BEHAVIOR.md` | identity and working rules (see `docs/self-config.md`) |

The base agent (no `PI_CODING_AGENT_DIR`) uses the shared repo for its own
notes too. A bot with `"memoryGlobal": false` in `settings.json` has only its
own notes; the shared scope is then refused.

## Tools

- `memory_search` — text + tags across both scopes; returns titles,
  descriptions, tags and paths. Use it before researching anything.
- `memory_read` — load one note by root (`agent` | `global`) and path.
- `memory_write` — create or update a note. The `description` is the retrieval
  key: write it as "use when…". Default scope is `agent`; use `global` only
  when another agent needs the fact, and say in chat what you moved there.

Every write regenerates the index and commits path-scoped with a timestamp and
your name. Do not run git in the memory dirs yourself; commits you make by hand
there are not part of the write flow.

## What belongs

Durable knowledge that lowers future cost: solved problems, user preferences,
reusable procedures, project decisions, discovered constraints. Not
transcripts, not transient thoughts, not conversation summaries.

- Update the existing note when the topic exists; keep one meaning in one
  place.
- Mark a replaced note `status: superseded` with a link instead of deleting
  it.
- SOUL.md and BEHAVIOR.md are configuration, not memory — discuss them with
  the user via the `self-config` skill.

## Policy in the prompt

The `<memory>` prompt section carries this policy (paths included) plus the
current `USER.md`, so you always know where notes live. `SOUL.md` is the
preamble and `BEHAVIOR.md` is the `<behavior>` section; the extension reads all
three on every run.

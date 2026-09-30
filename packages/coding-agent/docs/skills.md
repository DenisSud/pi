# Skills

Skills give you specialized instructions and supporting files for a particular
kind of work. Pi advertises each available skill by name and description, then
loads its full instructions only when the task calls for them.

Use a skill when a workflow needs more context than a prompt template but does
not need a new executable integration point. Skills can bundle scripts,
references, and assets alongside their instructions.

Pi implements the [Agent Skills specification](https://agentskills.io/specification).
Most invalid fields produce warnings rather than stopping startup.

## Create a skill

A skill is a directory containing `SKILL.md`:

```text
pdf-tools/
├── SKILL.md
├── scripts/
│   └── extract.sh
├── references/
│   └── formats.md
└── assets/
    └── template.json
```

Start `SKILL.md` with frontmatter followed by direct instructions:

```markdown
---
name: pdf-tools
description: Extract text and tables from PDF files. Use when reading, converting, or inspecting PDFs.
---

# PDF tools

Read `references/formats.md` before converting a document. Run scripts relative to this skill directory.
```

The description determines when the model considers loading the skill. State
both what the skill does and when it applies. Avoid descriptions such as
“Helps with PDFs,” which do not provide enough routing information.

Use relative paths from the skill directory when referring to bundled files.
Pi tells the model where the skill lives so it can resolve those paths.

## Understand how skills load

At startup, Pi scans configured skill locations and adds each skill's name,
description, and path to the system prompt. It does not add the full
instructions.

When a task matches, the model reads `SKILL.md` and follows its instructions.
This keeps detailed guidance out of context until it is needed. A model might
fail to load a relevant skill, so use `/skill:name` when you need to force it.
Arguments after `/skill:name` are appended as the user request:

```text
/skill:pdf-tools extract report.pdf
```

Set `disable-model-invocation: true` in frontmatter when a skill should be
available only through its explicit command.

## Add a skill

Place it under `<agent dir>/skills/<name>/SKILL.md` — directories containing
`SKILL.md` are discovered recursively — or install a [registry](registry.md)
package that ships one. There is no project scope to use: `.pi/` is inert for
bots.

Edits apply on commit: the service restarts you and the new skill appears. If
the skill should be shared with other bots, propose it for the registry rather
than copying it around.

## Write portable frontmatter

The Agent Skills specification defines these fields:

| Field | Purpose |
|---|---|
| `name` | Command and display name |
| `description` | Routing description shown to the model |
| `license` | License name or bundled license file |
| `compatibility` | Environment requirements |
| `metadata` | Additional key-value metadata |
| `allowed-tools` | Experimental pre-approved tool list |
| `disable-model-invocation` | Hide the skill from automatic model selection |

Names use lowercase letters, numbers, and hyphens, with no leading, trailing,
or consecutive hyphens. They can contain at most 64 characters; descriptions
can contain at most 1024.

Pi neither requires nor warns when the declared name differs from the parent
directory. Other Agent Skills implementations may enforce that requirement, so
matching names remain the portable choice.

Malformed `SKILL.md` files and declared skills without descriptions are not
loaded. Name collisions keep the first discovered skill and produce a warning.

## Validate and share a skill

Commit the skill, wait for the apply, and check that the name appears in your
skill list and that `/skill:name` loads it. Keep environment setup inside the
skill and declare any required runtime dependencies in the package that ships
it.

For examples, see the [Anthropic skills collection](https://github.com/anthropics/skills)
and [Pi skills collection](https://github.com/badlogic/pi-skills).

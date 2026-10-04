# Pi Packages

Pi packages install and distribute extensions, skills, prompt templates, and
themes as one unit. A bot uses them for shared capabilities: the
[registry](registry.md) ships the curated ones, and npm/git sources work too.

A package is an ordinary directory or npm package. It can expose conventional
resource directories, declare explicit paths under the `pi` key in
`package.json`, and carry its own runtime dependencies.

## Install a package

Declare it in `settings.json`:

```json
{
  "packages": ["<base package path>", "$PI_REGISTRY_DIR/ptc", "npm:@example/pi-tools@1.0.0"]
}
```

(Resolve `$PI_REGISTRY_DIR` to its absolute path; settings.json does not expand
variables.) Commit — the service stops your server, the reconciler installs
the declared union, and the next attach loads the package. There is no
`pi install` step to run.

Declarations live only in the agent directory; `.pi/settings.json` is inert for
bots. Do not run `pi update` — the service owns installations and updates. Do
not `pi remove` a managed entry; removing a declaration from `settings.json`
is the way to drop an optional package.

## Choose a source

| Source | Example | Behavior |
|---|---|---|
| Local | `$PI_REGISTRY_DIR/ptc` | Loaded from the path without copying; the registry is read-only in containers |
| npm | `npm:@example/pi-tools@1.0.0` | Installed by the reconciler under the bot dir |
| git | `git:github.com/example/pi-tools@v1` | Cloned and reconciled to the selected ref |

Versioned npm specifications are pinned. Git tags and commits are also pinned;
updates reconcile the checkout but do not move a configured ref. Prefer the
registry for shared resources; pull personal or experimental packages from npm
or git only when the user asked for it.

## Create a package

Use this when the user wants to publish something for other bots, or when a
registry item needs a change. The simplest package uses conventional
directories:

```text
my-pi-package/
├── package.json
├── extensions/
├── skills/
├── prompts/
└── themes/
```

Without a `pi` manifest, Pi discovers TypeScript and JavaScript extensions,
skill directories, Markdown prompts, and JSON themes from those directories.

Use an explicit manifest when resources live elsewhere or need filtering:

```json
{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./src/extension.ts"],
    "skills": ["./resources/skills"],
    "prompts": ["./resources/prompts/*.md"],
    "themes": ["./resources/themes/*.json"]
  }
}
```

Paths are relative to the package root. Arrays accept glob patterns and
exclusions. List dot-prefixed or symlinked resource roots directly when
traversal through a glob would not discover them.

## Declare dependencies

Put runtime packages imported by extensions in `dependencies`. Pi installs
package dependencies when it installs an npm or git source.

Pi supplies these packages to extensions and skills:

- `@earendil-works/pi-ai`
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

Declare the host-provided packages above in `peerDependencies` with a `"*"`
range and do not bundle them. Do not list them in `dependencies`: a physical
copy can bypass Pi's extension module mapping and create duplicate classes,
registries, and initialization work. Pi reports a warning when it detects this
manifest configuration.

Installed packages load with separate module roots. Do not rely on two
packages sharing one dependency instance or one package resolving another
package’s undeclared dependency.

## Select package resources

The object form in settings narrows which resources load from a package:

```json
{
  "packages": [
    {
      "source": "npm:@example/pi-tools",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"]
    }
  ]
}
```

For each resource type:

- Omit the property to load everything allowed by the package.
- Use `[]` to load none of that type.
- Use `!pattern` to exclude glob matches.
- Use `+path` to include one exact allowed path.
- Use `-path` to exclude one exact path.

Filters narrow the package manifest. They do not expose resources that the package itself did not declare.

Run `pi config` to enable or disable discovered resources and pi's built-in extensions. It starts with personal configuration; press Tab to switch scope, or run `pi config --local` to start with project overrides.

## Understand scope and identity

Bots have no project scope: declarations are personal to the agent directory,
and mandatory packages from the service admin layer are unioned in. Pi
identifies npm packages by package name, git packages by repository URL without
the ref, and local packages by resolved absolute path — so declaring the same
package twice never loads it twice.

Use [Extensions](extensions.md), [Skills](skills.md), and
[Registry](registry.md) to design each resource before packaging it.

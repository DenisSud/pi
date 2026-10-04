# Environment Variables

Pi uses environment variables in three ways:

- The launcher configures the bot process with `PI_*` variables — do not
  override these.
- Pi sets process markers so child processes can identify Pi as the launching
  agent.
- Commands run by the LLM-callable shell tools receive `PI_*` variables
  describing the current session.

Provider API-key variables are documented separately in [Providers](providers.md#use-an-api-key-from-the-environment).

## Launcher configuration

The service spawns each bot server with:

| Variable | Meaning |
|---|---|
| `PI_CODING_AGENT_DIR` | The bot's agent dir (also its git repo) |
| `PI_SERVER_DIR` | Per-bot server state |
| `PI_BOT_NAME` | The bot's name |
| `PI_EXPERIMENTAL` | Enables the experimental server/client stack |
| `PI_ADMIN_SETTINGS` | Path to the service admin settings file (model, packages, tool floor) |
| `PI_REGISTRY_DIR` | Where the package [registry](registry.md) is mounted |

These are process configuration: changing them in a shell breaks the service's
view of the bot. Override nothing here.

## Process markers

The server sets two markers that child processes inherit:

- `AI_AGENT=pi` — generic, lets tooling identify Pi as the agent that launched
  the process.
- `PI_CODING_AGENT=true` — Pi-specific.

## Shell tool session environment

Commands run by the `bash` tool receive the current session state:

| Variable | Description |
|----------|-------------|
| `PI_SESSION_ID` | Current session ID |
| `PI_SESSION_FILE` | Absolute path to the current session JSONL file; unset for ephemeral sessions |
| `PI_PROVIDER` | Currently selected model provider (the service-enforced one) |
| `PI_MODEL` | Currently selected model ID (the service-enforced one) |
| `PI_REASONING_LEVEL` | Current effective reasoning level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` |

The values are resolved when each command starts, so switching thinking levels
affects the next shell command without a restart.

When asked which model or provider is running, inspect these variables instead
of inferring the answer from the system prompt:

```bash
printf '%s/%s\n' "$PI_PROVIDER" "$PI_MODEL"
printf 'reasoning=%s session=%s\n' "$PI_REASONING_LEVEL" "$PI_SESSION_ID"
```

## Service-owned process settings

The stock `PI_*` process switches (`PI_OFFLINE`, `PI_SKIP_VERSION_CHECK`,
`PI_TELEMETRY`, `PI_SHARE_VIEWER_URL`, `PI_RADIUS_GATEWAY`, terminal detection
and cursor variables, proxy variables) configure the installation. The service
sets what it needs; the agent must not change installation or telemetry
settings. There is no self-update and no sharing in a bot session.

## Custom shell tools

Extensions that create their own shell tools with `createBashTool()` expose the
session environment by default when registered with Pi. Injection happens
before `spawnHook`, so a hook receives the variables in `ctx.env`:

```typescript
const bashTool = createBashTool(cwd, {
  spawnHook: (ctx) => ({
    ...ctx,
    env: { ...ctx.env, CI: "1" },
  }),
});
```

Disable session metadata independently of the spawn hook:

```typescript
const powershellTool = createPowerShellTool(cwd, {
  exposeSessionEnvironment: false,
  spawnHook: (ctx) => ctx,
});
```

When disabled, Pi removes inherited values for these variables so nested Pi processes do not expose stale parent-session metadata.

## Pi Process Configuration

These variables are read by Pi itself:

| Variable | Description |
|----------|-------------|
| `PI_CODING_AGENT_DIR` | Override the config directory; default is `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | Override session storage; overridden by `--session-dir` |
| `PI_PACKAGE_DIR` | Override the package directory, useful for Nix/Guix store paths |
| `PI_OFFLINE` | Disable automatic network activity, including model catalog refreshes |
| `PI_SKIP_VERSION_CHECK` | Disable the `pi.dev` latest-version request |
| `PI_TELEMETRY` | Override install/update telemetry and provider attribution headers: `1`/`true`/`yes` or `0`/`false`/`no` |
| `PI_CACHE_RETENTION` | Set to `long` for extended provider prompt caching where supported |
| `PI_SHARE_VIEWER_URL` | Override the base URL used by `/share` |
| `PI_RADIUS_GATEWAY` | Override the Radius gateway origin used by `/bug` uploads and Radius relay connections |
| `PI_HARDWARE_CURSOR` | Set to `1` to show the hardware cursor; see [Terminal setup](terminal-setup.md) |
| `PI_HYPERLINKS` | Override OSC 8 hyperlink detection with `1`, `0`, or `auto` |
| `PI_IMAGE_PROTOCOL` | Override inline image detection with `kitty`, `iterm2`, `none`, or `auto` |
| `PI_TRUE_COLOR` | Override truecolor detection with `1`, `0`, or `auto` |
| `PI_TUI_ESC_TIMEOUT` | How long to wait after a lone ESC before treating it as Escape, in milliseconds; defaults to `100` over SSH and `10` otherwise. Increase if Alt-key input is misread as Escape |
| `VISUAL`, `EDITOR` | External editor fallback when `externalEditor` is unset |
| `HTTP_PROXY`, `HTTPS_PROXY` | Proxy outbound HTTP requests |

Provider credentials such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and provider-specific configuration are listed in [Providers](providers.md#use-an-api-key-from-the-environment).

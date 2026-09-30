# Provider authentication

Authentication is **machine-wide and service-managed**. This page replaces the
stock provider guide, which does not apply to a bot.

- `auth.json` is a shared symlink into the service's agent dir. The user
  authenticates once through the web app (API key or OAuth/device-code flow)
  and every bot on the machine can use the provider.
- There are no provider environment variables to read or set, and no
  `/login` / `/logout` commands in your session.
- Service credentials (API tokens for integrations like Forgejo, Gmail,
  calendars) are reached through **secrets profiles**, not the provider layer:
  use the bash tool's `secrets` parameter or ptc's `secrets_sh`, reference
  variables like `$FORGEJO_TOKEN` inside the command, and never read, echo, or
  copy credential values. Output containing a secret is redacted.

Do not edit `auth.json`, do not run keyring tools, and do not ask the user to
paste credentials into the chat — send them to the provider login instead.

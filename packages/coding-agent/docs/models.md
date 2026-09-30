# Models

Your model is **managed by the service**. This page replaces the stock model
guide, which does not apply to a bot.

- `PI_ADMIN_SETTINGS` in your agent dir names the enforced provider and model
  (`defaultProvider`, `defaultModel`). Global and project settings are merged
  first, then the admin layer wins.
- `pi.models.select` is clamped: selecting any other model fails with "the
  model is managed by the service". The model picker is omitted from the UI.
- Your `thinking` level is yours to set (`defaultThinkingLevel` in
  `settings.json`, or the thinking control in the session).
- The model catalog and credentials are machine-wide; the user manages them
  through the service's provider login, not through your session.

If the user wants a different model for this deployment, that is a
service-side change — point them at the bot settings instead of trying to
change it yourself. Do not edit `models.json`, `models-store.json`, or
`auth.json`; they are shared symlinks.

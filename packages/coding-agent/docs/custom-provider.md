# Custom providers

Custom providers are **not available to a bot**. The service owns the model
catalog, the model choice and credentials:

- `models.json` and `models-store.json` are shared, service-owned symlinks.
- `pi.registerProvider()` is bound by the harness but should not be used: the
  admin model clamp still applies, and a bot never needs a private endpoint.
- A deployment that needs a custom endpoint adds it to the service's shared
  catalog, not to a bot's files.

Write an extension if you need to transform requests, not to add a provider.
For the provider surface that extensions do reach, see
[Extensions](extensions.md).

# Registry

The registry is the curated set of pi packages this deployment shares between
bots. Each entry is a real pi package; declaring it in your `settings.json` is
the install.

The service exports the location as `PI_REGISTRY_DIR` — always use it, never a
literal path (it differs between deployments and is read-only in a container):

```
$PI_REGISTRY_DIR/README.md      policy and the package list
$PI_REGISTRY_DIR/<name>/        one package: package.json with a pi manifest
```

## Adding a package

1. Read `$PI_REGISTRY_DIR/README.md` and pick the package name.
2. Add its path to your `settings.json` `packages` (keep the base package
   first):

   ```json
   {
     "packages": ["<base package path>", "$PI_REGISTRY_DIR/ptc"]
   }
   ```

   (Resolve `$PI_REGISTRY_DIR` yourself — settings.json does not expand
   variables — and write the resulting absolute path.)
3. Commit. The apply stops your server, the reconciler installs the declared
   union, and the next attach loads the package.
4. Verify after the restart that the extension's tools or the skill show up.

## Removing a package

Delete its entry from `packages` and commit. The reconciler no longer installs
it; installed files stay until the service prunes them, but they are no longer
loaded.

## Notes

- Packages load extensions, skills, prompts and themes as one unit. A registry
  package may contribute more than its name suggests — read its README or
  manifest first.
- Do not copy registry code into your own `extensions/` or `skills/` dir. If
  you need to change a package, discuss it with the user; promotion back into
  the registry is a service-side decision.
- The base package (memory, security, sysinfo, the self-config skill) is
  mandatory and comes from the service; the registry is the optional layer on
  top.

# Release checklist

- [ ] Review source, LICENSE, and the MIT provenance in README.
- [ ] Run `bun run typecheck && bun run build && bun test && bun run check:package && bun run check:package-negative && bun run verify:portable`.
- [ ] Run `bun run pack` (it runs the package gate first) and inspect the resulting archive; only package.json, README.md, LICENSE and dist/ui.js may ship.
- [ ] Verify local structural types and an isolated exact-version install through an APIv1 Wolfpack host (`verify:host-types`, then `verify:host-install`). The SRI-serving loopback fixture is runtime-only; confirm the separate child-HOME public CLI install/list/update/remove receipt.
- [ ] Confirm the intended host has Extensions APIv1 (published wolfpack-bridge 1.6.24 does not).
- [ ] After explicit approval, manually publish `wolfpack-extension-changes@0.1.1`. Do not add credentials or an auto-publish workflow.

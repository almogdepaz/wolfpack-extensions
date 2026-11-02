# Wolfpack Extensions

Independent, prebuilt Wolfpack extension packages. This repository is separate from the Wolfpack framework: it contains product widgets, not framework source.

## Packages

- `wolfpack-extension-changes@0.1.1` (`changes`): read-only local Git status.
- `wolfpack-extension-agent-context@0.1.0` (`agent-context`): schema-v3 focus panel, automatic Pi 1.4.0+ companion, Claude Code plugin (local marketplace at this repository root), and optional owned skill.
- `wolfpack-extension-notes@0.1.0` (`notes`): scoped local notes and a vertical-stack recipe.
- `wolfpack-extension-sketch@0.1.0` (`sketch`): touch-first drawing board, structured compose and scoped board documents.

All packages target the prerelease Extensions APIv1. `wolfpack-bridge@1.6.24` published to npm does **not** provide APIv1 and is not compatible with these packages. Changes `0.1.1` is [published on npm](https://www.npmjs.com/package/wolfpack-extension-changes/v/0.1.1); Agent Context and Notes remain prepared but unpublished.

## Install

Only exact npm coordinates and absolute package directories are currently supported by Wolfpack:

```sh
wolfpack extensions install npm:wolfpack-extension-changes@0.1.1 --trust-browser-code
wolfpack extensions install /absolute/path/to/wolfpack-extension-notes --trust-browser-code
```

### Agent Context: panel + agent integration required

**The Wolfpack extension install does not install the Claude Code plugin or Pi companion.** Installing only the panel (even with `--skills pi`) does not enable automatic updates.

1. Install the panel from a built repository checkout:
   ```sh
   wolfpack extensions install /absolute/path/to/wolfpack-extensions/packages/agent-context --trust-browser-code
   ```
2. Install the integration for your agent (both if you use both):
   - **Claude Code:** add the repository marketplace, then install its plugin:
     ```sh
     claude plugin marketplace add /absolute/path/to/wolfpack-extensions
     claude plugin install wolfpack-agent-context@wolfpack-extensions
     ```
   - **Pi:** install the companion:
     ```sh
     pi install /absolute/path/to/wolfpack-extensions/packages/agent-context
     ```
3. **Start a new agent session in Wolfpack.** Existing sessions do not load the integration automatically; `/clear` is not plugin activation. Give the new session an ordinary task and verify that the panel receives an update.

Replace the placeholder path with your local checkout and keep it available for the local Claude marketplace. `--skills pi` is optional recovery skill text, not a substitute for step 2. See the [complete setup and upgrade guide](packages/agent-context/README.md).

Only schema-changing Agent Context upgrades (now v3) require a verified replacement followed by an explicit clean reinstall, discarding only that extension's old host documents. Do not purge for a first install or ordinary same-schema update, or force reload active sessions. Automatic maintenance is model-authored through the Pi companion or Claude Code plugin, not transcript scraping or an observer model.

Do not claim `.tgz` paths or URLs are direct install sources. Archives are release-review artifacts; unpack an archive to an absolute directory before a local install. No package runs a consumer build or install lifecycle script.

## Development

The repository has no Wolfpack checkout or runtime dependency. With Bun and Node 22+, install its pinned tools at this root, then run `bun run typecheck`, `bun run build`, `bun test`, `bun run check:package`, `bun run check:package-negative`, and `bun run pack`. Package checks fresh-build and pack actual npm archives with tight allowlists. Optional host compatibility/install verification is deliberately a release-review step against an explicitly supplied APIv1 host, not normal development or publication: `WOLFPACK_EXTENSION_HOST_ROOT=/absolute/api-v1-host bun run verify:host-compat` then `... bun run verify:host-install`. The install proof uses only absolute unpacked package directories in an owned temporary HOME.

Agent Context additionally has selected-peer `verify:pi-agent-context` (set `WOLFPACK_PI_PACKAGE_ROOT`), isolated `verify:host-agent-context-publisher` (set both peer/host paths) and `verify:claude-agent-context` (set `WOLFPACK_EXTENSION_HOST_ROOT`) gates. They exercise the real Pi lifecycle, or the built Claude server through the official MCP stdio client with the shipped hooks, and the public CLI against an owned host fixture with scripted model/hook events and no provider calls. Its Claude server bundles the official MCP SDK at build time from declared dev dependencies. Host-provided peers are deliberately omitted by the offline portability installer; ordinary package development does not require or install Pi.

See `RELEASE.md` for the release checklist and publication record.

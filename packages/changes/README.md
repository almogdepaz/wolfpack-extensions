# Wolfpack Changes extension

A read-only Git status context view for Wolfpack. It shows the selected **local** session's launch project branch plus staged, unstaged, and untracked paths, and, on hosts that provide `project.gitDiff()`, read-only per-file diffs of staged and unstaged tracked files and of untracked files as new files. It is not a diff editor: it has no stage, commit, discard, file-write, arbitrary path, command, shell, token, or terminal API.

## Install and manage

The package contains its prebuilt browser bundle; installation neither clones Wolfpack nor runs a build, lifecycle script, or runtime dependency install.

```sh
wolfpack extensions install npm:wolfpack-extension-changes@0.1.1 --trust-browser-code
wolfpack extensions update npm:wolfpack-extension-changes@0.1.1 --trust-browser-code
wolfpack extensions disable changes
wolfpack extensions enable changes
wolfpack extensions remove changes
```

`--trust-browser-code` is required because this installs browser JavaScript into the authenticated Wolfpack UI. Review the exact package/version before granting it. The extension asks the host only for `project.gitStatus()` and, when the host provides it, `project.gitDiff()` for the selected local session, and uses its scoped browser `storage` only to remember collapse state; the host binds that request to its installed extension and exact session UUID. It reads the session launch project, not a later terminal `cd`. Remote sessions are unavailable and never fall back to local data.

Paths are grouped under staged, unstaged, and untracked, with nested directory disclosures expanded by default. Click a directory or use Space/Enter on its heading to hide all its descendants in that group (for example, `tests/`); other groups are unaffected. Group and directory collapse state survives polling refreshes and is saved in browser local storage scoped to this installation and session, so it also survives remounts, session switches and reloads; available focused headings survive polling refreshes while the view is mounted. If a focused directory disappears, focus returns to its nearest remaining parent heading, its group, or Refresh when the group is empty. Summarized untracked directories remain leaf entries, not browsable folders; their diff shows every untracked file under them.

On hosts that provide `project.gitDiff()`, each staged, unstaged and untracked file row is a disclosure that shows that file's text diff; an untracked file shows as a new file. Nothing is fetched until a diff is first opened; then one request returns the staged, unstaged and untracked diffs, and every open row reuses it. While a diff is open, the view refetches when the polled status changes or on Refresh diffs, and keeps the previous diff on screen, marked stale, until the new one arrives. The host caps each section, cutting at a line boundary, and reports truncation; the view then shows a truncation notice, files past the cut show a truncation note, and the last file before the cut may be incomplete. The host diffs at most 32 untracked regular files of up to 128 KiB each (48 KiB of untracked diff in total) and reports anything it skipped, such as symlinks, nested repositories, files past the 32nd or larger files, with the same truncation flag, so the truncation notice also shows while such untracked entries exist, even when the staged and unstaged diffs are complete. Hosts from before untracked diffs show "This host does not diff untracked files." on untracked rows. Binary files, or files that changed since the last check, show a short note. Open diffs are kept in memory only. Diffs are rendered as inert markup inside the widget and are never sent anywhere; on older hosts without `project.gitDiff()` the view shows plain rows and no diff controls.

Git execution is host-owned, fixed-argv and read-only. The host disables inherited Git overrides, global/system configuration, hooks, optional index writes, fsmonitor, filters, submodule traversal and rename detection, applies output/time bounds, and reports truncation/unavailability rather than claiming a clean tree. The widget polls serially every five seconds only while its view and browser page are visible; manual refresh and browser focus refresh are available.

## Compatibility

This package requires Wolfpack Extensions APIv1 with `context.project.gitStatus(signal?)`. Diffs additionally need `context.project.gitDiff(signal?)`, added in Wolfpack host commit `8a5d5f1c` (unreleased); without it the view still works and shows no diffs. The validated host source revision for `gitStatus` and `gitDiff` is `c0854195da6ca4788d532bbe77ea0600b3cf8a86`; it provides staged and unstaged diffs but not the `untracked` section, so untracked rows there show the older-host note. Untracked-file diffs additionally need the optional `untracked` section of `gitDiff`, added in Wolfpack host commit `8d1f8820` on branch `feat/extension-untracked-diff` (unreleased, not yet merged); this view was validated against that branch at `d5a51a93`. The published `wolfpack-bridge@1.6.24` does **not** provide these APIs and cannot install/use this package. There is intentionally no compatibility shim for older hosts.

## Develop independently

Requirements: Bun and Node 22+ for package tooling. No Wolfpack checkout or unpublished `wolfpack-bridge` package is needed. From this monorepo, install the pinned development tools at the repository root.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun test
bun run check:package
bun run check:package-negative
bun run pack
```

Set `WOLFPACK_WIDGET_BRAVE=/Applications/Brave\\ Browser.app/Contents/MacOS/Brave\\ Browser` to run the portable browser regressions with a chosen local Brave binary; otherwise Playwright's installed Chromium is used. Browser binaries are a development-test prerequisite, not a package dependency.

`check:package` fresh-builds `src/ui.ts` into a temporary directory and byte-compares it with `dist/ui.js` before packing; it parses the shipped bundle to reject static imports, dynamic imports, and `require`. `check:package-negative` permanently exercises isolated stale-source and dormant-dynamic-import counterfactuals. Package-manager subprocesses use temporary HOME/cache/user-config paths with install scripts disabled; this is verification isolation, not a claim about a consumer's npm configuration.

The source uses local structural APIv1 types only (`src/api.ts`). They are compile-time documentation, not a vendored framework or runtime dependency. `dist/ui.js` has no imports and is the exact browser asset declared by the manifest; the diff renderer (diff2html, a pinned development dependency) is bundled into it at build time.

## Optional host verification

Normal development never needs a Wolfpack checkout. A release reviewer with an APIv1 host checkout can additionally run the isolated proof (it uses a temporary child `HOME`, an SRI loopback registry for the runtime fixture, and public CLI operations only on the exact unpacked archive):

```sh
WOLFPACK_EXTENSION_HOST_ROOT=/absolute/path/to/api-v1-wolfpack bun run verify:host-types
WOLFPACK_EXTENSION_HOST_ROOT=/absolute/path/to/api-v1-wolfpack bun run verify:host-install
```

`verify:host-types` uses this package's pinned TypeScript 6.0.3 in strict/ignore-config mode to compare a locally authored context-view contribution directly with the host contribution parameter, plus context/status shapes. The runtime fixture's loopback registry only proves archive SRI acquisition. The public CLI intentionally uses its fixed production registry for `npm:` sources; the loopback registry is only trusted runtime-fixture injection. The same proof separately invokes the public CLI with the packed archive unpacked locally, so it does not claim a CLI local-registry install.

## Provenance and release

Extracted from Wolfpack revision `c0854195da6ca4788d532bbe77ea0600b3cf8a86` under the MIT license; see `LICENSE`. `dist/ui.js` also bundles third-party code under its own licenses: [diff2html](https://github.com/rtfpessoa/diff2html) 3.4.56 (MIT, Copyright 2014-2016 Rodrigo Fernandes), [diff](https://github.com/kpdecker/jsdiff) 8.0.4 (BSD-3-Clause, Copyright 2009-2015 Kevin Decker), and [@profoundlogic/hogan](https://github.com/ProfoundLogic/hogan.js-ProfoundLogic) 3.0.4 (Apache-2.0, Copyright 2011 Twitter, Inc.). The extracted UI behavior and tests originated in the Wolfpack Changes extension sample. A release maintainer must review the packed artifact, run the checks above and the isolated host-install verification, confirm the target host API, and manually publish only after approval. This repository has no auto-publish workflow and assumes no npm credentials.

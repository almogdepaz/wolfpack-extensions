# Wolfpack Agent Context

Extensions APIv1 focus panel (`agent-context/context`, **schema v3**) plus two explicitly loaded integrations in the same package: a **Pi 1.4.0+** companion and a **Claude Code** plugin (verified against Claude Code 2.1.316). No terminal widget or observer model.

The panel answers: goal, **now**, **needs you**, **need to know**, **next**, and collapsed decisions/completed history. Every requested user action stays visible. Facts beyond the first three remain accessible under “More need to know”; next steps have explicit agent/user ownership. Native disclosures, copy controls and browser-only drafts survive updates. Legacy v1 payloads remain readable, with unknown freshness/ownership; they cannot be newly published to v3.

## Setup: install the panel AND your agent integration

**Installing the Wolfpack extension does not install the Claude Code plugin or Pi companion.** Automatic updates require both the panel and the integration for your agent. `--skills pi` installs optional skill text, not executable hooks. There is no combined installer or automatic install script.

Requires a Wolfpack host with Extensions APIv1 and verified `session current-context`. Published `wolfpack-bridge@1.6.24` is incompatible. Use a repository checkout containing this version's prebuilt assets and `.claude-plugin/marketplace.json` for the commands below; no consumer build is needed. Replace `/absolute/path/to/wolfpack-extensions` with its actual directory and keep that checkout available: the local Claude marketplace loads its plugin in place. Wolfpack does not directly install `.tgz` paths or URLs and never builds consumer assets. An unpacked reviewed package can supply the panel/Pi integration, but the Claude marketplace command needs the repository root.

### 1. Install the panel

```sh
wolfpack extensions install /absolute/path/to/wolfpack-extensions/packages/agent-context --trust-browser-code
```

Optionally add `--skills pi` for the standalone recovery skill. **This step alone does not enable automatic updates.**

### 2. Install the integration for your agent

**Claude Code:** run both commands. Point the marketplace command at the repository root, not `packages/agent-context`.

```sh
claude plugin marketplace add /absolute/path/to/wolfpack-extensions
claude plugin install wolfpack-agent-context@wolfpack-extensions
```

**Pi:** run this command instead. If you use both agents, install both integrations.

```sh
pi install /absolute/path/to/wolfpack-extensions/packages/agent-context
```

### 3. Start a new agent session in Wolfpack

Existing sessions do not automatically load the newly installed integration. **`/clear` is not a plugin installation or reload.** Start a new Claude Code or Pi session in Wolfpack, then give it an ordinary task. The panel should receive an agent-authored update; a remaining “No context yet” is not proof that activation succeeded. Outside a verified Wolfpack session the integrations remain inactive.

Do not force reload active sessions. The separate public `pi install` command loads the explicit `pi.extensions: ["dist/pi.js"]` resource on a new Pi session or an explicitly requested idle reload. The Pi manifest disables skill discovery to avoid duplicate ownership with Wolfpack's skill deployment. Pi supplies the declared `@earendil-works/pi-coding-agent` and `typebox` peers; do not install or bundle private copies.

The repository root is a local Claude Code marketplace (`.claude-plugin/marketplace.json`) whose `wolfpack-agent-context` entry is this package directory (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `skills/`, built `dist/claude.mjs`). A plugin added from a local path loads in place; it needs `node` on `PATH` and no package installation (the official MCP SDK is bundled at build time, see `THIRD_PARTY_NOTICES.md`; there is no plugin lockfile, so Claude Code runs no dependency install). The plugin ships the same skill text as `--skills pi`; where both skill roots are visible, the copies are identical. Claude Code activates plugins in new sessions (or `/reload-plugins`); never force-reload active agents.

## Schema-changing upgrades only

**Do not purge for a first installation, an ordinary same-schema update, or to troubleshoot activation.** For a verified schema-changing replacement (such as v2→v3), the deployment owner explicitly runs `wolfpack extensions purge agent-context` before installing the replacement panel. This discards only existing `agent-context` host documents across sessions, not other extensions or browser-local drafts. Do not purge before all replacement gates pass. Then follow the integration and activation steps above as needed.

## Automatic maintenance

Both integrations bind the exact verified Wolfpack UUID/project (`wolfpack session current-context` must report the integration's own harness) and expose a structured `update_focus` tool. The working model authors the snapshots; it should update before substantive work, at meaningful changes and before finishing. This is proactive guidance, not guaranteed model obedience.

**Pi.** Before work, the companion binds the active Pi session/branch and supplies concise guidance. The tool is sequential and model-only (not callable from nested/codemode tools), keeping coverage unambiguous; explicit tool restrictions can disable it. A missing update triggers at most **one** `agent_before_settle` refresh continuation per request; aborted/error runs do not. `agent_settled`, not `agent_end`, records final observed activity. Branch state comes only from active Pi entries.

**Claude Code.** One stdio MCP server per Claude session (official SDK) serves `update_focus` (loaded upfront, not deferred behind tool search) and a hook-only `lifecycle` endpoint; native `mcp_tool` hooks reach the same process, so lifecycle state is shared in memory without IPC. A small `SessionStart` command prints the guidance, because launch-time `SessionStart` runs before MCP servers are available. Hooks forward only native identifiers (`session_id`, `prompt_id`, `tool_use_id`, `agent_id`, session `source`), never prompts, tool input/output, transcripts or assistant text:

- The `SessionStart` guidance and everything below apply only after `wolfpack session current-context` verifies a Claude Wolfpack session for this exact project. Elsewhere (a non-Wolfpack terminal, another project or harness) the plugin stays inert: no guidance, refresh continuation, missed write or "not synced" note; an attempted `update_focus` still returns an honest error and diagnostics go to stderr.
- `UserPromptSubmit` binds or rebinds the native session and starts a request; the `SessionStart` lifecycle hook is routed only to `/clear` and compaction (matcher `clear|compact`), because launch-time SessionStart (including `--continue`/`--resume`/`--fork-session`) has no MCP client context; it rebinds when the session id changes. Every source still runs the guidance command, and `/resume`/fork rebind at their next request. A failed bind is retried at most once per request (never by other hooks), and once a request found the session unverified, the guidance is delivered once after a later bind verifies. Delayed hooks from a replaced session are ignored.
- `PreToolUse` on the exact tool name pins each call's `tool_use_id` to its session; the server accepts `update_focus` only with matching Claude tool-use metadata, from the main conversation (not subagents), and fails closed otherwise. Model calls to the lifecycle endpoint are rejected (hook calls carry no tool-use metadata).
- `PostToolUse`/`PostToolUseFailure` advance the latest boundary by `tool_use_id`; successful self-maintenance does not, failed maintenance (including invalid arguments) does. `PostToolBatch` (all results of a batch resolved, before the next model request) marks that boundary as delivered to the model. Each update covers only the boundary delivered when its `PreToolUse` fired, so a sibling result in the same batch leaves the stored review immediately unreviewed; without `PostToolBatch` coverage fails safe (stale, never falsely reviewed).
- A main-conversation `update_focus` that was pinned but never executed by the time its batch ends or the turn stops (for example a permission denial, which fires no failure hook) counts as failed maintenance: earlier coverage is lost, one refresh is requested, and a repeated denial ends missed. Subagent attempts and successful own maintenance do not invalidate coverage.
- `Stop` asks for at most **one** refresh per request through `additionalContext`, then marks retained content missed and activity idle. `StopFailure` (API errors) marks it missed/interrupted. Stop does not run on user interruption, so an interrupted turn keeps its last dated “working” report until the next request.
- Hooks return promptly; publication runs in the background and failures stay visible (stderr, the next request's context, tool errors) without injecting model turns. Process restart re-reads the host and restores semantics only from a document produced by the same native Claude session, marked unreviewed.

The tool requires normal Claude Code permission: default-mode users approve it, auto mode applies its classifier. The plugin does not grant itself permissions.

Semantic `updatedAt` is separate from observed activity time. “Reviewed” means reviewed **at that update**, not fresh forever. “Last reported: working/idle/interrupted/unknown” is not live presence. No heartbeats, transcript scraping, hidden-reasoning extraction, automatic task execution, percentages or terminal injection. A crash may leave a dated “working” report; a browser reconnect does not renew it. Read/subscription errors are shown separately from document freshness.

Publication uses public verified identity/read/CAS/publish commands, private temporary files and validated receipts. Mutations serialize. Identical semantic snapshots at the same conversation boundary are skipped; runtime writes never refresh semantic time or replace another producer's semantic content. Conflicts expose the current document/revision and require an agent-authored reconciliation with `reconcileRevision`. Ambiguous responses retry the identical operation/request ID once, retaining it for another attempt in the same binding; failure is never marked synced. Process replacement discards unresolved in-memory attempts and re-reads the host before any new write. No durable retry daemon or cross-process completion claim is made.

Never publish secrets, transcripts, hidden reasoning or invented evidence. Proposed next steps are intentions, not permissions. Receipts prove storage only, not browser rendering, authorship or completed work. The [format reference](skills/wolfpack-agent-context/references/context-format.md) documents exact bounds and provenance.

## Verification

Focused local checks: `bun test packages/agent-context/test`, package `build`, `typecheck`, `check:package`, `check:package-negative`, `pack`. Building needs the declared dev dependencies (`@modelcontextprotocol/sdk`, `zod`) installed. Ordinary typecheck covers shared publisher/controller/browser/Claude server code; the Pi entry uses host-provided types checked by the selected-peer gate:

```sh
WOLFPACK_PI_PACKAGE_ROOT=/absolute/node_modules/@earendil-works/pi-coding-agent bun run verify:pi-agent-context
WOLFPACK_EXTENSION_HOST_ROOT=/absolute/wolfpack bun run verify:host-agent-context-schema
# Both variables: real Pi SDK lifecycle + public CLI + isolated host/schema/CAS store, no provider calls
WOLFPACK_EXTENSION_HOST_ROOT=/absolute/wolfpack WOLFPACK_PI_PACKAGE_ROOT=/absolute/node_modules/@earendil-works/pi-coding-agent bun run verify:host-agent-context-publisher
# Built Claude server via the official MCP stdio client + shipped hooks.json + public CLI + isolated host
WOLFPACK_EXTENSION_HOST_ROOT=/absolute/wolfpack bun run verify:claude-agent-context
claude plugin validate packages/agent-context && claude plugin validate .
```

Browser tests use built assets at 220/320/960px, keyboard/disclosure/draft retention and axe. The lifecycle tests use a scripted model or scripted native hook events, not a claim that a production model obeys every update instruction or that a live Claude process loaded the hooks. Live activation, real-device coverage and actual deployment remain separate checks. The browser bundle is self-contained; the Pi companion imports only Node builtins and Pi-provided peers; the Claude server imports only Node builtins. `src/api.ts` is erased structural browser API documentation, not a host runtime dependency.

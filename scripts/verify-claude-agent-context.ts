#!/usr/bin/env bun
/**
 * Built Claude plugin server through the official MCP stdio client, the shipped hooks.json rendered with
 * Claude Code's native mcp_tool templating, the public Wolfpack CLI and an isolated selected host store.
 * Hook events are scripted from the documented/verified native payloads; no live Claude, model or host.
 */
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CLAUDE_FOCUS_TOOL, CLAUDE_FOCUS_TOOL_ID, CLAUDE_LIFECYCLE_TOOL, TOOL_USE_META } from "../packages/agent-context/src/claude.ts";
import { focusSnapshot } from "../packages/agent-context/test/focus-fixture.ts";
import { matcherSelects, renderHookInput, type NativeHookGroup } from "../packages/agent-context/test/claude-native.ts";
import { unpackShippedPackage } from "../packages/agent-context/scripts/package-env.ts";

const host = process.env.WOLFPACK_EXTENSION_HOST_ROOT;
if (!host) throw new Error("set WOLFPACK_EXTENSION_HOST_ROOT to the selected APIv1 host source directory");
const root = resolve(import.meta.dirname, "..");
if (!process.argv.includes("--isolated")) {
  const stage = mkdtempSync(join(tmpdir(), "wolfpack-claude-focus-"));
  try {
    for (const directory of ["home", "tmp", "project", "bin"]) mkdirSync(join(stage, directory));
    // The shipped package (npm-packed, unpacked) is both the host install source and the Claude plugin root.
    const shipped = unpackShippedPackage(join(root, "packages/agent-context"), stage);
    const child = Bun.spawn([process.execPath, import.meta.path, "--isolated"], { cwd: stage, env: {
      PATH: `${join(stage, "bin")}:${process.env.PATH ?? ""}`, HOME: join(stage, "home"), TMPDIR: join(stage, "tmp"), SHELL: "/bin/sh",
      WOLFPACK_EXTENSION_HOST_ROOT: host, FOCUS_TEST_STAGE: stage, FOCUS_TEST_PACKAGE: shipped,
    }, stdout: "inherit", stderr: "inherit", timeout: 120_000 });
    if (await child.exited !== 0) throw new Error("isolated Claude focus verification failed");
  } finally { rmSync(stage, { recursive: true, force: true }); }
} else {
  const stage = process.env.FOCUS_TEST_STAGE!, pluginRoot = process.env.FOCUS_TEST_PACKAGE!;
  assert.equal(process.env.HOME, join(stage, "home")); assert.equal(pluginRoot, join(stage, "shipped", "package"));
  const project = join(stage, "project"), wolfpackSession = "11111111-1111-4111-8111-111111111111";
  const claudeSession = "33333333-3333-4333-8333-333333333333", clearedSession = "55555555-5555-4555-8555-555555555555";
  Object.assign(process.env, { WOLFPACK_SESSION_ID: wolfpackSession, WOLFPACK_SESSION_NAME: "fixture", WOLFPACK_PROJECT_DIR: project, WOLFPACK_AGENT_KIND: "claude" });
  const wrapper = join(stage, "bin", "wolfpack");
  writeFileSync(wrapper, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(host, "src/cli/index.ts"))} "$@"\n`); chmodSync(wrapper, 0o700);
  const { ExtensionRuntime } = await import(join(host, "src/extensions/runtime.ts"));
  const { ExtensionRouteService } = await import(join(host, "src/server/extension-routes.ts"));
  const runtime = new ExtensionRuntime({ root: join(stage, "extensions"), installationId: "22222222-2222-4222-8222-222222222222" });
  await runtime.install({ source: pluginRoot, trustBrowserCode: true });
  const service = new ExtensionRouteService({ runtime, backend: { listSessionFacts: async () => [{ name: "fixture", alive: true, identity: { wolfpackSessionId: wolfpackSession } }] } });
  let rejectWrites = false; let identityDown = false;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, "http://127.0.0.1");
      if (url.pathname === "/api/session-control/status") {
        if (identityDown) { res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { code: "BACKEND_UNAVAILABLE", message: "fixture identity outage" } })); return; }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, sessionId: wolfpackSession, session: "fixture", projectDir: project, harness: "claude", state: "active", terminal: { exists: true, alive: true, status: "ready" } })); return;
      }
      if (rejectWrites && req.method === "POST") { res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { code: "STORE_UNAVAILABLE", message: "fixture offline" } })); return; }
      if (!await service.handle(req, res, url)) { res.writeHead(404); res.end(); }
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert(address && typeof address !== "string");
  mkdirSync(join(stage, "home/.wolfpack"), { recursive: true }); writeFileSync(join(stage, "home/.wolfpack/config.json"), JSON.stringify({ devDir: project, port: address.port }));
  const read = async () => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/extensions/documents/agent-context/context?session=${wolfpackSession}`);
    assert.equal(response.status, 200); return await response.json() as { revision: number; document: any };
  };
  /** Lifecycle publication is deliberately asynchronous to hooks; wait boundedly for the stored effect. */
  const until = async (label: string, predicate: (value: { revision: number; document: any }) => boolean) => {
    const deadline = Date.now() + 15_000; let last: unknown;
    while (Date.now() < deadline) { const value = await read(); last = value; if (predicate(value)) return value; await Bun.sleep(50); }
    throw new Error(`${label}: stored document never satisfied the expectation: ${JSON.stringify(last)}`);
  };

  const hooks = (JSON.parse(readFileSync(join(pluginRoot, "hooks/hooks.json"), "utf8")) as { hooks: Record<string, NativeHookGroup[]> }).hooks;
  const plugin = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin/plugin.json"), "utf8"));
  const serverConfig = plugin.mcpServers.focus as { command: string; args: string[] };
  const substitute = (value: string) => value.replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginRoot);
  const stderr: string[] = [];
  let client!: Client;
  const connect = async () => {
    const transport = new StdioClientTransport({ command: serverConfig.command, args: serverConfig.args.map(substitute), cwd: project, env: { ...process.env as Record<string, string>, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_ROOT: pluginRoot }, stderr: "pipe" });
    transport.stderr?.on("data", chunk => stderr.push(String(chunk)));
    client = new Client({ name: "claude-code-fixture", version: "2.1.316" }); await client.connect(transport);
  };
  const textOf = (result: any) => (result.content as Array<{ type: string; text: string }>).map(item => item.text).join("\n");
  /** Claude Code hook dispatch: matching groups, exec-form command hooks, mcp_tool calls without tool-use metadata. */
  const fire = async (name: string, payload: Record<string, unknown>, options: { launch?: boolean } = {}) => {
    const outputs: string[] = [];
    for (const group of hooks[name] ?? []) {
      // Native matcher query: tool name for tool events, `source` for SessionStart.
      const query = typeof payload.tool_name === "string" ? payload.tool_name : name === "SessionStart" ? payload.source : undefined;
      if (typeof query === "string" && !matcherSelects(group.matcher, query)) continue;
      for (const hook of group.hooks) {
        if (hook.type === "command") {
          // Asynchronous like Claude Code: the command's own CLI identity check calls the host API this process serves.
          const child = Bun.spawn([hook.command!, ...(hook.args ?? []).map(substitute)], { cwd: project, env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: project }, stdin: new TextEncoder().encode(JSON.stringify(payload)), stdout: "pipe", stderr: "pipe" });
          const [exitCode, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
          assert.equal(exitCode, 0, err); outputs.push(out); continue;
        }
        // Native: launch-time SessionStart has no MCP client context, so the shipped routing must not select one here.
        if (options.launch) throw new Error(`${name} (${String(payload.source)}) at launch selected an mcp_tool hook that Claude cannot run`);
        const result = await client.callTool({ name: hook.tool!, arguments: renderHookInput(hook.input, { ...payload, hook_event_name: name }) as Record<string, unknown> });
        assert.notEqual(result.isError, true, `${name} hook failed: ${textOf(result)}`); outputs.push(textOf(result));
      }
    }
    return outputs.filter(Boolean);
  };
  const common = (sessionId: string) => ({ session_id: sessionId, transcript_path: join(stage, "transcript.jsonl"), cwd: project, permission_mode: "default" });
  let toolCounter = 0;
  /** Native PostToolBatch: once every call of a batch resolved, before the next model request; carries raw tool_calls. */
  const batchEnd = (sessionId: string, promptId: string, agentId?: string) => fire("PostToolBatch", { ...common(sessionId), prompt_id: promptId, tool_calls: [{ tool_name: "Bash", tool_input: { command: "cat secret" }, tool_use_id: "toolu_raw", tool_response: "raw tool output that must never be forwarded" }], ...(agentId && { agent_id: agentId }) });
  const focusEvent = (sessionId: string, promptId: string, args: unknown, toolUseId: string) => ({ ...common(sessionId), prompt_id: promptId, tool_name: CLAUDE_FOCUS_TOOL_ID, tool_input: args, tool_use_id: toolUseId, mcp_server: { name: "plugin:wolfpack-agent-context:focus", source: "plugin" } });
  /** Native model tool call: PreToolUse hook, tools/call with claudecode/toolUseId metadata, PostToolUse/Failure hook, then (by default) its batch end. */
  const model = async (sessionId: string, promptId: string, args: unknown, options: { batch?: boolean } = {}) => {
    const toolUseId = `toolu_fixture_${++toolCounter}`; const event = focusEvent(sessionId, promptId, args, toolUseId);
    await fire("PreToolUse", event);
    const result = await client.callTool({ name: CLAUDE_FOCUS_TOOL, arguments: args as Record<string, unknown>, _meta: { [TOOL_USE_META]: toolUseId } });
    if (result.isError) await fire("PostToolUseFailure", { ...event, error: textOf(result), is_interrupt: false });
    else await fire("PostToolUse", { ...event, tool_response: result.content });
    if (options.batch !== false) await batchEnd(sessionId, promptId);
    return result;
  };
  /** Permission-denied model call: PreToolUse fires, the tool never executes, no failure hook; the batch still ends. */
  const denied = async (sessionId: string, promptId: string, args: unknown) => {
    await fire("PreToolUse", focusEvent(sessionId, promptId, args, `toolu_denied_${++toolCounter}`));
    await batchEnd(sessionId, promptId);
  };
  const otherTool = async (sessionId: string, promptId: string, options: { agentId?: string; batch?: boolean } = {}) => {
    await fire("PostToolUse", { ...common(sessionId), prompt_id: promptId, tool_name: "Bash", tool_input: { command: "bun test" }, tool_response: { stdout: "ok" }, tool_use_id: `toolu_bash_${++toolCounter}`, ...(options.agentId && { agent_id: options.agentId }) });
    if (options.batch !== false) await batchEnd(sessionId, promptId, options.agentId);
  };
  const prompt = async (sessionId: string, promptId: string) => fire("UserPromptSubmit", { ...common(sessionId), prompt_id: promptId, prompt: "user request text that must never be forwarded" });
  const stop = async (sessionId: string) => {
    const outputs = await fire("Stop", { ...common(sessionId), stop_hook_active: false, last_assistant_message: "assistant text that must never be forwarded", background_tasks: [], session_crons: [] });
    return outputs.map(output => JSON.parse(output));
  };

  try {
    await connect();
    const listed = await client.listTools();
    const focusTool = listed.tools.find(tool => tool.name === CLAUDE_FOCUS_TOOL);
    assert(focusTool && listed.tools.some(tool => tool.name === CLAUDE_LIFECYCLE_TOOL) && listed.tools.length === 2);
    assert.deepEqual(focusTool._meta, { "anthropic/alwaysLoad": true });
    assert.deepEqual((focusTool.inputSchema as any).required, ["snapshot"]);
    // D-01/D-02: an unverifiable identity (outage, or a non-Wolfpack session) withholds guidance, refreshes and nags.
    identityDown = true;
    assert.deepEqual(await fire("SessionStart", { ...common(claudeSession), hook_event_name: "SessionStart", source: "startup", model: "claude-opus-5-5" }, { launch: true }), []);
    const p0 = "44444444-4444-4444-8444-444444444440";
    assert.deepEqual(await prompt(claudeSession, p0), []); await otherTool(claudeSession, p0);
    assert.deepEqual(await stop(claudeSession), []);
    assert.deepEqual(await prompt(claudeSession, "44444444-4444-4444-8444-44444444444a"), []);
    assert.deepEqual(await stop(claudeSession), []);
    assert.equal((await read()).document, null);
    // The outage ends: the next request retries the binding once and announces the panel.
    identityDown = false;
    const recoveryPrompt = "44444444-4444-4444-8444-44444444444b";
    const announcements = await prompt(claudeSession, recoveryPrompt);
    // If the retry outlives the bounded prompt wait, the guidance arrives once at the next batch end instead.
    for (const deadline = Date.now() + 15_000; !announcements.length && Date.now() < deadline; await Bun.sleep(100)) announcements.push(...await batchEnd(claudeSession, recoveryPrompt));
    assert.equal(announcements.length, 1); assert.match(announcements[0]!, new RegExp(CLAUDE_FOCUS_TOOL_ID));
    assert.deepEqual(await batchEnd(claudeSession, recoveryPrompt), []); // exactly once
    const guidance = await fire("SessionStart", { ...common(claudeSession), hook_event_name: "SessionStart", source: "startup", model: "claude-opus-5-5" }, { launch: true });
    assert.equal(guidance.length, 1); assert.match(guidance[0]!, new RegExp(CLAUDE_FOCUS_TOOL_ID));

    // Initial automatic publication and an explicit user decision.
    const p1 = "44444444-4444-4444-8444-444444444441";
    assert.deepEqual(await prompt(claudeSession, p1), []);
    const choice = { ...focusSnapshot, needsYou: [{ id: "choice", text: "Choose whether updates include file paths" }] };
    assert.notEqual((await model(claudeSession, p1, { snapshot: choice })).isError, true);
    let stored = await until("initial publication", value => value.document?.freshness === "reviewed" && value.document.activity.state === "working");
    assert.deepEqual(stored.document.source, { harness: "claude", sessionId: claudeSession, promptId: p1, coveredToolUseId: null });
    assert.deepEqual(stored.document.needsYou, choice.needsYou); assert.equal(stored.document.schemaVersion, 3);
    assert(!JSON.stringify(stored.document).includes("never be forwarded"));
    // Later work removes coverage; Stop requests one refresh which resolves the choice and finishes idle.
    await otherTool(claudeSession, p1);
    await until("coverage lost", value => value.document.freshness === "unreviewed");
    const refresh = await stop(claudeSession);
    assert.equal(refresh.length, 1); assert.equal(refresh[0].hookSpecificOutput.hookEventName, "Stop"); assert.match(refresh[0].hookSpecificOutput.additionalContext, /update_focus/);
    const resolved = { ...focusSnapshot, now: { id: "verify", text: "Verify the focused checks" }, needsYou: [] };
    assert.notEqual((await model(claudeSession, p1, { snapshot: resolved })).isError, true);
    assert.deepEqual(await stop(claudeSession), []);
    stored = await until("final idle", value => value.document.activity.state === "idle" && value.document.freshness === "reviewed");
    assert.deepEqual(stored.document.needsYou, []); assert.equal(stored.document.now.id, "verify");
    assert.match(stored.document.source.coveredToolUseId, /^toolu_bash_/);
    const semanticTime = stored.document.updatedAt;

    // New request without maintenance: one refresh only, then retained old semantics are marked missed.
    const p2 = "44444444-4444-4444-8444-444444444442";
    await prompt(claudeSession, p2); await otherTool(claudeSession, p2);
    assert.equal((await stop(claudeSession)).length, 1); assert.deepEqual(await stop(claudeSession), []);
    stored = await until("missed refresh", value => value.document.freshness === "missed" && value.document.activity.state === "idle");
    assert.equal(stored.document.updatedAt, semanticTime);

    // Subagent internals are not boundaries; malformed maintenance and model calls to the hook endpoint fail.
    const p3 = "44444444-4444-4444-8444-444444444443";
    await prompt(claudeSession, p3);
    assert.notEqual((await model(claudeSession, p3, { snapshot: resolved })).isError, true);
    await otherTool(claudeSession, p3, { agentId: "agent-subtask" });
    const invalid = await model(claudeSession, p3, { snapshot: { ...resolved, nextSteps: [{ id: "x", text: "Missing owner" }] } });
    assert.equal(invalid.isError, true);
    const impersonation = await client.callTool({ name: CLAUDE_LIFECYCLE_TOOL, arguments: { event: "stop", session_id: claudeSession }, _meta: { [TOOL_USE_META]: "toolu_model_impersonation" } });
    assert.equal(impersonation.isError, true);
    assert.equal((await stop(claudeSession)).length, 1, "failed maintenance after success invalidates coverage");
    assert.notEqual((await model(claudeSession, p3, { snapshot: resolved })).isError, true);
    assert.deepEqual(await stop(claudeSession), []);
    stored = await until("covering recovery", value => value.document.freshness === "reviewed" && value.document.activity.state === "idle");
    assert.match(stored.document.source.coveredToolUseId, /^toolu_fixture_/);

    // D-03: [Bash, update_focus] in one batch: the unseen sibling result leaves the stored review immediately stale.
    const p3b = "44444444-4444-4444-8444-44444444444c"; await prompt(claudeSession, p3b);
    await otherTool(claudeSession, p3b, { batch: false });
    assert.notEqual((await model(claudeSession, p3b, { snapshot: { ...resolved, now: { id: "batched", text: "Batched update" } } }, { batch: false })).isError, true);
    stored = await until("mixed batch stale", value => value.document.now.id === "batched" && value.document.freshness === "unreviewed");
    assert.equal(stored.document.source.coveredToolUseId, null);
    await batchEnd(claudeSession, p3b);
    assert.equal((await stop(claudeSession)).length, 1);
    assert.notEqual((await model(claudeSession, p3b, { snapshot: resolved })).isError, true);
    assert.deepEqual(await stop(claudeSession), []);
    stored = await until("mixed batch covered", value => value.document.freshness === "reviewed" && value.document.activity.state === "idle");
    assert.match(stored.document.source.coveredToolUseId, /^toolu_bash_/);
    // D-04: a permission-denied update loses the earlier coverage, gets one refresh, and is then missed.
    const p3c = "44444444-4444-4444-8444-44444444444d"; await prompt(claudeSession, p3c);
    assert.notEqual((await model(claudeSession, p3c, { snapshot: resolved })).isError, true);
    await until("covered before denial", value => value.document.freshness === "reviewed" && value.document.source.promptId === p3c);
    await denied(claudeSession, p3c, { snapshot: { ...resolved, needsYou: [{ id: "ask", text: "Approve the change" }] } });
    await until("denial stale", value => value.document.freshness === "unreviewed");
    assert.equal((await stop(claudeSession)).length, 1);
    await denied(claudeSession, p3c, { snapshot: resolved });
    assert.deepEqual(await stop(claudeSession), []);
    stored = await until("denial missed", value => value.document.freshness === "missed" && value.document.activity.state === "idle");
    assert.deepEqual(stored.document.needsYou, []);
    stored = await read();

    // Another writer: CAS conflict exposes current state; explicit reconciliation succeeds.
    const other = { ...stored.document, goal: "Another writer's goal" }; const file = join(stage, "other.json"); writeFileSync(file, JSON.stringify(other));
    // Asynchronous spawn: this process also serves the host API the CLI calls.
    const published = Bun.spawn(["wolfpack", "extension-data", "publish", "agent-context/context", "--session", wolfpackSession, "--file", file, "--if-revision", String(stored.revision), "--request-id", crypto.randomUUID(), "--json"], { env: process.env, stdout: "pipe", stderr: "pipe" });
    assert.equal(await published.exited, 0, await new Response(published.stdout).text() + await new Response(published.stderr).text());
    const p4 = "44444444-4444-4444-8444-444444444444"; await prompt(claudeSession, p4);
    const conflict = await model(claudeSession, p4, { snapshot: resolved });
    assert.equal(conflict.isError, true); assert.match(textOf(conflict), /Another writer's goal/);
    const current = await read();
    assert.notEqual((await model(claudeSession, p4, { snapshot: resolved, reconcileRevision: current.revision })).isError, true);
    stored = await until("reconciled", value => value.document.goal === resolved.goal && value.document.freshness === "reviewed");

    // Unavailable store: genuine error to the model, next request context says not synced, document unchanged.
    rejectWrites = true; const before = JSON.stringify((await read()).document);
    const p5 = "44444444-4444-4444-8444-444444444445"; await prompt(claudeSession, p5);
    const failed = await model(claudeSession, p5, { snapshot: { ...resolved, goal: "Unpublished goal" } });
    assert.equal(failed.isError, true); assert.match(textOf(failed), /STORE_UNAVAILABLE/);
    const context = await prompt(claudeSession, "44444444-4444-4444-8444-444444444446");
    assert.match(context.join("\n"), /not synced/);
    assert.equal(JSON.stringify((await read()).document), before);
    rejectWrites = false;
    await fire("StopFailure", { ...common(claudeSession), error: "rate_limit", error_details: "429", last_assistant_message: "API Error" });
    stored = await until("API failure", value => value.document.activity.state === "interrupted" && value.document.freshness === "missed");

    // /clear: a new native session rebinds; delayed old-session hooks cannot repaint it.
    await fire("SessionStart", { ...common(clearedSession), source: "clear" });
    stored = await until("clear rebinding", value => value.document.activity.state === "unknown");
    const p6 = "44444444-4444-4444-8444-444444444447"; await prompt(clearedSession, p6);
    assert.deepEqual(await stop(claudeSession), []);
    assert.notEqual((await model(clearedSession, p6, { snapshot: { ...resolved, goal: "Fresh conversation" } })).isError, true);
    stored = await until("new conversation", value => value.document.source.sessionId === clearedSession);
    assert.deepEqual(await stop(clearedSession), []);
    stored = await until("new conversation idle", value => value.document.activity.state === "idle");

    // Process restart (e.g. --resume): a new server restores the same native session's semantics as unreviewed.
    await client.close(); await connect();
    await fire("SessionStart", { ...common(clearedSession), source: "resume" }, { launch: true });
    await prompt(clearedSession, "44444444-4444-4444-8444-444444444448");
    stored = await until("restart", value => value.document.freshness === "unreviewed" && value.document.activity.state === "working");
    assert.equal(stored.document.goal, "Fresh conversation");
    assert.equal((await stop(clearedSession)).length, 1);
    process.stdout.write("shipped (npm-packed) Claude plugin server + official MCP stdio client + shipped hooks (native templating) + public verified CLI + isolated host: unverified-identity inertness and recovery, automatic publication, user choice and clearing, bounded refresh, mixed-batch coverage, permission-denied maintenance, missed/failed/invalid maintenance, provenance rejection, CAS reconciliation, visible store failure, API failure, /clear fencing and restart restoration passed (scripted hook events; no live Claude or provider calls)\n");
  } finally {
    await client?.close().catch(() => {});
    await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()));
    if (stderr.length) process.stdout.write(`server diagnostics (expected for injected failures):\n${stderr.join("")}`);
  }
}

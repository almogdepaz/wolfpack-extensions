#!/usr/bin/env bun
/** Real Pi lifecycle + public CLI + isolated selected Wolfpack host. No live sessions/models. */
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { focusSnapshot } from "../packages/agent-context/test/focus-fixture.ts";
import { FOCUS_REFRESH_MESSAGE, FOCUS_STATE_ENTRY } from "../packages/agent-context/src/companion.ts";
import { unpackShippedPackage } from "../packages/agent-context/scripts/package-env.ts";
const host = process.env.WOLFPACK_EXTENSION_HOST_ROOT, pi = process.env.WOLFPACK_PI_PACKAGE_ROOT;
if (!host || !pi) throw new Error("set WOLFPACK_EXTENSION_HOST_ROOT and WOLFPACK_PI_PACKAGE_ROOT to selected installed source directories");
const root = resolve(import.meta.dirname, "..");
if (!process.argv.includes("--isolated")) {
  const stage = mkdtempSync(join(tmpdir(), "wolfpack-focus-e2e-"));
  try {
    for (const directory of ["home", "tmp", "project", "bin"]) mkdirSync(join(stage, directory));
    // The shipped package (npm-packed, unpacked) is both the host install source and the loaded Pi companion.
    const shipped = unpackShippedPackage(join(root, "packages/agent-context"), stage);
    const child = Bun.spawn([process.execPath, import.meta.path, "--isolated"], { cwd: stage, env: {
      PATH: `${join(stage, "bin")}:${process.env.PATH ?? ""}`, HOME: join(stage, "home"), TMPDIR: join(stage, "tmp"), SHELL: "/bin/sh",
      WOLFPACK_EXTENSION_HOST_ROOT: host, WOLFPACK_PI_PACKAGE_ROOT: pi, FOCUS_TEST_STAGE: stage, FOCUS_TEST_PACKAGE: shipped,
    }, stdout: "inherit", stderr: "inherit", timeout: 90_000 });
    if (await child.exited !== 0) throw new Error("isolated focus publisher verification failed");
  } finally { rmSync(stage, { recursive: true, force: true }); }
} else {
  const stage = process.env.FOCUS_TEST_STAGE!, shipped = process.env.FOCUS_TEST_PACKAGE!;
  assert.equal(process.env.HOME, join(stage, "home")); assert.equal(shipped, join(stage, "shipped", "package"));
  const project = join(stage, "project"), agentDir = join(stage, "pi-agent"), sessionId = "11111111-1111-4111-8111-111111111111";
  Object.assign(process.env, { WOLFPACK_SESSION_ID: sessionId, WOLFPACK_SESSION_NAME: "fixture", WOLFPACK_PROJECT_DIR: project, WOLFPACK_AGENT_KIND: "pi" });
  const wrapper = join(stage, "bin", "wolfpack");
  writeFileSync(wrapper, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(host, "src/cli/index.ts"))} "$@"\n`); chmodSync(wrapper, 0o700);
  const { ExtensionRuntime } = await import(join(host, "src/extensions/runtime.ts"));
  const { ExtensionRouteService } = await import(join(host, "src/server/extension-routes.ts"));
  const runtime = new ExtensionRuntime({ root: join(stage, "extensions"), installationId: "22222222-2222-4222-8222-222222222222" });
  await runtime.install({ source: shipped, trustBrowserCode: true });
  const service = new ExtensionRouteService({ runtime, backend: { listSessionFacts: async () => [{ name: "fixture", alive: true, identity: { wolfpackSessionId: sessionId } }] } });
  let rejectWrites = false; let rejectNextWrite = false;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, "http://127.0.0.1");
      if (url.pathname === "/api/session-control/status") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, sessionId, session: "fixture", projectDir: project, harness: "pi", state: "active", terminal: { exists: true, alive: true, status: "ready" } })); return;
      }
      if ((rejectWrites || rejectNextWrite) && req.method === "POST") { rejectNextWrite = false; res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { code: "STORE_UNAVAILABLE", message: "fixture offline" } })); return; }
      if (!await service.handle(req, res, url)) { res.writeHead(404); res.end(); }
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  mkdirSync(join(stage, "home/.wolfpack"), { recursive: true }); writeFileSync(join(stage, "home/.wolfpack/config.json"), JSON.stringify({ devDir: project, port: address.port }));
  const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(join(pi, "dist/index.js"));
  const { createAssistantMessageEventStream } = await import(resolve(pi, "../../@earendil-works/pi-ai/dist/utils/event-stream.js"));
  const { getModel } = await import(resolve(pi, "../../@earendil-works/pi-ai/dist/compat.js"));
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const modelRuntime = await ModelRuntime.create({ authPath: join(stage, "auth.json"), modelsPath: null, modelsStorePath: join(stage, "models-store.json"), refreshOnCreate: false, allowModelNetwork: false });
  await modelRuntime.setRuntimeApiKey("anthropic", "isolated-fixture-not-a-real-key");
  const resourceLoader = new DefaultResourceLoader({ cwd: project, agentDir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, additionalExtensionPaths: [join(shipped, "dist/pi.js")] });
  await resourceLoader.reload();
  const sessionManager = SessionManager.inMemory(project);
  const { session } = await createAgentSession({ cwd: project, agentDir, resourceLoader, modelRuntime, model: getModel("anthropic", "claude-sonnet-4-5"), settingsManager, sessionManager });
  const errors: unknown[] = []; const events: string[] = [];
  try {
    await session.bindExtensions({ mode: "print", onError: (error: unknown) => errors.push(error) });
    session.subscribe((event: { type: string }) => events.push(event.type));
    let calls = 0; let mode: "updates" | "missed" | "aborted" | "failure" | "transient-focus-failure" | "malformed-focus" | "focus-recovery" = "updates";
    session.agent.streamFunction = async (_model: unknown, context: { messages: Array<{ role: string; content: unknown; toolsAdded?: Array<{ name: string }> }> }) => {
      calls++; assert(calls <= (mode === "focus-recovery" ? 5 : 4), "fixture continuation exceeded bounded request count");
      assert(session.getActiveToolNames().includes("update_focus"), "focus tool must be available before work");
      assert(context.messages.some(message => message.toolsAdded?.some(tool => tool.name === "update_focus")), "focus tool declaration must reach the model");
      assert(JSON.stringify(context.messages).includes("Maintain this session's Wolfpack focus panel automatically"));
      const stream = createAssistantMessageEventStream();
      const coverageScenario = mode === "transient-focus-failure" || mode === "malformed-focus" || mode === "focus-recovery";
      const snapshot = coverageScenario
        ? { ...focusSnapshot, needsYou: calls === 1 ? [] : [{ id: "approval", text: "Approve before proceeding" }] }
        : calls === 1 ? focusSnapshot : { ...focusSnapshot, now: { id: "verify", text: "Verify the focused checks" }, needsYou: [] };
      if (coverageScenario && calls === 2 && mode !== "malformed-focus") rejectNextWrite = true;
      if (coverageScenario && calls === 3) {
        const current = await read();
        assert.equal(current.document.freshness, "unreviewed", `AC-D01: ${mode} after an earlier success must invalidate coverage`);
        assert.deepEqual(current.document.needsYou, []);
      }
      const useTool = mode === "updates" && calls <= 2 || mode === "failure" && calls === 1 || coverageScenario && calls <= 2 || mode === "focus-recovery" && calls === 4;
      const parameters = mode === "malformed-focus" && calls === 2 ? { snapshot: { ...snapshot, nextSteps: [{ id: "invalid", text: "Missing owner" }] } } : { snapshot };
      const message = { role: "assistant", content: useTool ? [{ type: "toolCall", id: `focus-${calls}`, name: "update_focus", arguments: parameters }] : [{ type: "text", text: "fixture final response" }], api: "anthropic-messages", provider: "anthropic", model: "claude-sonnet-4-5", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: mode === "aborted" ? "aborted" : useTool ? "toolUse" : "stop", timestamp: Date.now() };
      stream.push({ type: "start", partial: message });
      if (mode === "aborted") queueMicrotask(() => { void session.abort(); stream.push({ type: "error", reason: "aborted", error: message }); stream.end(); });
      else { stream.push({ type: "done", reason: message.stopReason, message }); stream.end(); }
      return stream;
    };
    const read = async () => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/extensions/documents/agent-context/context?session=${sessionId}`);
      assert.equal(response.status, 200); return await response.json() as { revision: number; document: any };
    };
    await session.prompt("Implement the requested change");
    let stored = await read(); assert.equal(calls, 3, JSON.stringify({ errors, messages: session.messages })); assert.equal(stored.document.now.text, "Verify the focused checks"); assert.equal(stored.document.needsYou.length, 0); assert.equal(stored.document.activity.state, "idle"); assert.equal(stored.document.freshness, "reviewed");
    assert(events.includes("agent_settled"));
    for (const scenario of ["transient-focus-failure", "malformed-focus", "focus-recovery"] as const) {
      const start = sessionManager.getBranch().length; mode = scenario; calls = 0;
      await session.prompt(`Same-request focus coverage: ${scenario}`);
      stored = await read();
      const branch = sessionManager.getBranch().slice(start);
      const initial = branch.find((entry: any) => entry.type === "custom" && entry.customType === FOCUS_STATE_ENTRY)?.data;
      const failed = branch.find((entry: any) => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "update_focus" && entry.message.isError);
      assert(initial && failed, `${scenario}: successful initial snapshot and structured failed result required`);
      // This diagnostic is emitted by Pi argument validation before companion execute.
      if (scenario === "malformed-focus") assert.match(failed.message.content[0].text, /Validation failed for tool "update_focus"/);
      assert.equal(branch.filter((entry: any) => entry.type === "custom" && entry.customType === FOCUS_STATE_ENTRY).length, scenario === "focus-recovery" ? 2 : 1);
      assert.equal(branch.filter((entry: any) => entry.type === "custom_message" && entry.customType === FOCUS_REFRESH_MESSAGE).length, 1, `${scenario}: exactly one final refresh`);
      assert.equal(calls, scenario === "focus-recovery" ? 5 : 4, `${scenario}: no duplicate maintenance loop`);
      assert.equal(stored.document.activity.state, "idle");
      if (scenario === "focus-recovery") {
        assert.equal(stored.document.freshness, "reviewed"); assert.equal(stored.document.source.coveredEntryId, failed.id);
        assert.deepEqual(stored.document.needsYou, [{ id: "approval", text: "Approve before proceeding" }]);
      } else {
        assert.equal(stored.document.freshness, "missed"); assert.equal(stored.document.updatedAt, initial.updatedAt);
        assert.deepEqual(stored.document.now, initial.now); assert.deepEqual(stored.document.needsYou, []);
      }
    }
    const semanticTime = stored.document.updatedAt;
    mode = "missed"; calls = 0; await session.prompt("A new request without model maintenance");
    stored = await read(); assert.equal(calls, 2, "one final refresh, never a loop"); assert.equal(stored.document.freshness, "missed"); assert.equal(stored.document.updatedAt, semanticTime);
    mode = "aborted"; calls = 0; await session.prompt("Interrupted request"); stored = await read(); assert.equal(calls, 1); assert.equal(stored.document.activity.state, "interrupted"); assert.equal(stored.document.updatedAt, semanticTime);
    await session.reload(); stored = await read(); assert.equal(stored.document.freshness, "unreviewed"); assert.equal(stored.document.activity.state, "unknown"); assert.equal(stored.document.updatedAt, semanticTime);
    const firstUser = sessionManager.getBranch().find((entry: any) => entry.type === "message" && entry.message.role === "user"); assert(firstUser);
    await session.navigateTree(firstUser.id, { summarize: false }); stored = await read(); assert.equal(stored.document.freshness, "unreviewed"); assert.equal(stored.document.updatedAt, semanticTime);
    rejectWrites = true; mode = "failure"; calls = 0; const beforeFailure = JSON.stringify(stored.document);
    await session.prompt("Request while the publisher is unavailable");
    const failedTool = sessionManager.getBranch().findLast((entry: any) => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "update_focus");
    assert(failedTool?.message.isError, "publish failure must reach the working model as a failed tool result");
    stored = await read(); assert.equal(JSON.stringify(stored.document), beforeFailure, "failed publication must not claim new semantic freshness"); assert(calls <= 3);
    assert.deepEqual(errors, []);
    process.stdout.write("real Pi 1.4 lifecycle + shipped (npm-packed) companion + public verified CLI + isolated host: automatic structured updates, cleared actions, same-request transient/validation failures, covering recovery, bounded missed refresh, interruption, reload/tree fences and visible publication failure passed (scripted model; no provider calls)\n");
  } finally { session.dispose(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

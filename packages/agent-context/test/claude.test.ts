import { expect, test } from "bun:test";
import { CLAUDE_FOCUS_TOOL, CLAUDE_GUIDANCE, CLAUDE_LIFECYCLE_TOOL, CLAUDE_TOOLS, ClaudeFocusController, TOOL_USE_META, callTool, parseLifecycle, startupGuidance } from "../src/claude.ts";
import { FocusPublisher, PublicationError, type PublicationTransport } from "../src/publisher.ts";
import type { FocusDocument } from "../src/focus.ts";
import { claudeFocusDocument, focusSnapshot } from "./focus-fixture.ts";

const SESSION = "33333333-3333-4333-8333-333333333333", OTHER = "55555555-5555-4555-8555-555555555555";
const PROMPT = "44444444-4444-4444-8444-444444444444";
let clock = 0;
const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();
function fixture(initial: FocusDocument | null = null, projectDir: string | null = "/project") {
  let document = initial; let revision = initial ? 1 : 0; const writes: FocusDocument[] = []; const resolved: string[] = [];
  const transport: PublicationTransport = {
    resolve: async dir => { resolved.push(dir); return { sessionId: "11111111-1111-4111-8111-111111111111", projectDir: dir }; },
    read: async () => ({ document, revision }),
    publish: async (_scope, value) => { document = value; writes.push(value); return { revision: ++revision }; },
  };
  const errors: string[] = [];
  const controller = new ClaudeFocusController(new FocusPublisher(transport, now), projectDir ?? undefined, message => errors.push(message));
  const hook = async (args: Record<string, string>) => {
    const result = await callTool(controller, CLAUDE_LIFECYCLE_TOOL, args, undefined); await controller.settled(); return result;
  };
  const prompt = (sessionId = SESSION, promptId = PROMPT) => hook({ event: "prompt", session_id: sessionId, prompt_id: promptId });
  const done = (toolUseId: string, failed = false, sessionId = SESSION, agentId = "") => hook({ event: "tool_done", session_id: sessionId, tool_use_id: toolUseId, agent_id: agentId, failed: String(failed) });
  const stop = (sessionId = SESSION) => hook({ event: "stop", session_id: sessionId });
  /** Native PostToolBatch: every call in the batch resolved, before the next model request. */
  const batch = (sessionId = SESSION, agentId = "") => hook({ event: "tool_batch", session_id: sessionId, agent_id: agentId });
  /** Native order: PreToolUse hook, model tools/call with toolUseId metadata, then PostToolUse/Failure hook. */
  const focus = async (toolUseId: string, args: unknown = { snapshot: focusSnapshot }, options: { sessionId?: string; agentId?: string; postHook?: boolean } = {}) => {
    await hook({ event: "pre_focus", session_id: options.sessionId ?? SESSION, tool_use_id: toolUseId, agent_id: options.agentId ?? "" });
    const result = await callTool(controller, CLAUDE_FOCUS_TOOL, args, { [TOOL_USE_META]: toolUseId });
    if (options.postHook !== false) await done(toolUseId, result.isError === true, options.sessionId ?? SESSION, options.agentId ?? "");
    return result;
  };
  return { controller, transport, writes, errors, resolved, hook, prompt, done, stop, batch, focus, get document() { return document; }, set document(value) { document = value; revision++; } };
}
const refresh = (output: unknown) => { const text = (output as { content: Array<{ text: string }> }).content[0]!.text; return text ? JSON.parse(text) : null; };

test("first request binds the exact Claude session/project; structured update carries native prompt boundary", async () => {
  const f = fixture(); await f.prompt();
  expect(f.resolved).toEqual(["/project"]);
  const result = await f.focus("toolu_a");
  expect(result.isError).toBeUndefined();
  expect(f.document?.source).toEqual({ harness: "claude", sessionId: SESSION, promptId: PROMPT, coveredToolUseId: null });
  expect(f.document).toMatchObject({ schemaVersion: 3, freshness: "reviewed", activity: { state: "working" }, needsYou: focusSnapshot.needsYou });
  expect(refresh(await f.stop())).toBeNull(); // own successful maintenance is not a new boundary
  expect(f.document?.activity.state).toBe("idle"); expect(f.document?.freshness).toBe("reviewed");
});

test("hook/model provenance is exact: no metadata, impersonated hooks, missing/foreign/subagent PreToolUse or reuse fail closed", async () => {
  const f = fixture(); await f.prompt();
  expect((await callTool(f.controller, CLAUDE_FOCUS_TOOL, { snapshot: focusSnapshot }, undefined)).isError).toBe(true);
  expect((await callTool(f.controller, CLAUDE_LIFECYCLE_TOOL, { event: "stop", session_id: SESSION }, { [TOOL_USE_META]: "toolu_model" })).isError).toBe(true);
  expect((await callTool(f.controller, CLAUDE_FOCUS_TOOL, { snapshot: focusSnapshot }, { [TOOL_USE_META]: "toolu_unpinned" })).isError).toBe(true);
  expect((await f.focus("toolu_sub", undefined, { agentId: "agent-1" })).isError).toBe(true);
  expect((await f.focus("toolu_foreign", undefined, { sessionId: OTHER, postHook: false })).isError).toBe(true);
  expect((await callTool(f.controller, "unknown_tool", {}, { [TOOL_USE_META]: "toolu_x" })).isError).toBe(true);
  expect(f.writes.filter(write => write.freshness === "reviewed")).toHaveLength(0);
  expect((await f.focus("toolu_ok")).isError).toBeUndefined();
  expect((await callTool(f.controller, CLAUDE_FOCUS_TOOL, { snapshot: focusSnapshot }, { [TOOL_USE_META]: "toolu_ok" })).isError).toBe(true); // replay of a consumed call id
});

test("later work removes coverage; Stop requests exactly one refresh, then retains old semantics as missed", async () => {
  const f = fixture(); await f.prompt(); await f.focus("toolu_a");
  const semanticTime = f.document!.updatedAt;
  await f.done("toolu_bash");
  expect(f.document?.freshness).toBe("unreviewed"); expect(f.document?.updatedAt).toBe(semanticTime);
  const first = refresh(await f.stop());
  expect(first).toMatchObject({ hookSpecificOutput: { hookEventName: "Stop" } });
  expect(first.hookSpecificOutput.additionalContext).toContain("update_focus");
  expect(f.document?.activity.state).toBe("working"); // continuing, not idle
  expect(refresh(await f.stop())).toBeNull();
  expect(f.document).toMatchObject({ freshness: "missed", activity: { state: "idle" }, updatedAt: semanticTime, now: focusSnapshot.now });
  await f.prompt(SESSION, "66666666-6666-4666-8666-666666666666");
  await f.done("toolu_more");
  expect(refresh(await f.stop())).not.toBeNull(); // the budget is per request
});

test("failed self-maintenance after an earlier success invalidates coverage even without its failure hook", async () => {
  const f = fixture(); await f.prompt(); await f.focus("toolu_a", { snapshot: { ...focusSnapshot, needsYou: [] } });
  const semanticTime = f.document!.updatedAt;
  const invalid = await f.focus("toolu_bad", { snapshot: { ...focusSnapshot, nextSteps: [{ id: "x", text: "No owner" }] } }, { postHook: false });
  expect(invalid.isError).toBe(true);
  const publish = f.transport.publish; f.transport.publish = async () => { throw new PublicationError("unavailable", "fixture offline"); };
  expect((await f.focus("toolu_offline", { snapshot: focusSnapshot })).isError).toBe(true);
  f.transport.publish = publish;
  await f.done("toolu_bad", true); // a late duplicate failure hook is harmless
  await f.batch(); // native: the failed results are delivered before the next model request
  expect(f.document).toMatchObject({ needsYou: [], updatedAt: semanticTime });
  expect(refresh(await f.stop())).not.toBeNull();
  expect((await f.focus("toolu_cover", { snapshot: focusSnapshot })).isError).toBeUndefined();
  expect(f.document?.source).toEqual({ harness: "claude", sessionId: SESSION, promptId: PROMPT, coveredToolUseId: "toolu_offline" });
  expect(refresh(await f.stop())).toBeNull();
  expect(f.document).toMatchObject({ freshness: "reviewed", activity: { state: "idle" }, needsYou: focusSnapshot.needsYou });
});

test("malformed, oversized, unknown or raw-content lifecycle fields are rejected without state changes", async () => {
  for (const input of [
    null, [], "prompt", { event: "prompt", session_id: SESSION, prompt_id: PROMPT, prompt: "user text" },
    { event: "tool_done", session_id: SESSION, tool_use_id: "t", agent_id: "", failed: "yes" },
    { event: "tool_done", session_id: SESSION, tool_use_id: "t", agent_id: "", failed: true },
    { event: "prompt", session_id: "x".repeat(129), prompt_id: "" }, { event: "prompt", session_id: "", prompt_id: "" },
    { event: "prompt", session_id: "a b", prompt_id: "" }, { event: "unknown", session_id: SESSION },
    { event: "session_start", session_id: SESSION, source: "guess" }, { event: "stop", session_id: SESSION, transcript_path: "/tmp/t.jsonl" },
    { event: "pre_focus", session_id: SESSION, tool_use_id: "", agent_id: "" },
    { event: "tool_batch", session_id: SESSION, agent_id: "", tool_calls: "[{\"tool_response\":\"secret\"}]" },
  ]) expect(() => parseLifecycle(input)).toThrow(PublicationError);
  expect(parseLifecycle({ event: "tool_batch", session_id: SESSION, agent_id: "" })).toEqual({ event: "tool_batch", sessionId: SESSION, agentId: null });
  const f = fixture(); await f.prompt(); const before = f.writes.length;
  expect((await f.hook({ event: "prompt", session_id: OTHER, prompt_id: PROMPT, prompt: "secret" })).isError).toBe(true);
  expect(f.writes.length).toBe(before); expect(f.resolved).toHaveLength(1);
  expect(parseLifecycle({ event: "tool_done", session_id: SESSION, tool_use_id: "toolu_1", agent_id: "", failed: "true" })).toEqual({ event: "tool_done", sessionId: SESSION, toolUseId: "toolu_1", agentId: null, failed: true });
  expect(parseLifecycle({ event: "prompt", session_id: SESSION, prompt_id: "" })).toEqual({ event: "prompt", sessionId: SESSION, promptId: null });
});

test("subagent work and delayed callbacks from a replaced Claude session cannot change the active binding", async () => {
  const f = fixture(); await f.prompt(); await f.focus("toolu_a");
  await f.done("toolu_sub_internal", false, SESSION, "agent-1");
  expect(f.document?.freshness).toBe("reviewed"); // the parent's Agent tool result is the boundary
  await f.prompt(OTHER, "77777777-7777-4777-8777-777777777777"); // /clear, /resume or fork: new native session id
  expect(f.controller.snapshot).toBeNull(); // another conversation's semantics are not restored
  const writes = f.writes.length;
  await f.done("toolu_old", false, SESSION); expect(refresh(await f.stop(SESSION))).toBeNull();
  expect(f.writes.length).toBe(writes);
  expect((await f.focus("toolu_stale", undefined, { sessionId: SESSION })).isError).toBe(true);
  expect((await f.focus("toolu_new", undefined, { sessionId: OTHER })).isError).toBeUndefined();
  expect(f.document?.source).toMatchObject({ harness: "claude", sessionId: OTHER });
});

test("an in-flight update is fenced when the native session changes", async () => {
  const f = fixture(); await f.prompt();
  const publish = f.transport.publish; let release!: () => void; let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  f.transport.publish = async (...args) => { if (args[1].freshness === "reviewed") { began(); await new Promise<void>(resolve => { release = resolve; }); } return publish(...args); };
  await f.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_slow", agent_id: "" });
  const pending = callTool(f.controller, CLAUDE_FOCUS_TOOL, { snapshot: focusSnapshot }, { [TOOL_USE_META]: "toolu_slow" }); await started;
  await f.hook({ event: "session_start", session_id: OTHER, source: "clear" }); release();
  expect((await pending).isError).toBe(true);
  expect(f.controller.snapshot).toBeNull();
});

test("process restart restores only the same native session's remote semantics, marked unreviewed", async () => {
  const same = fixture(claudeFocusDocument); await same.prompt();
  expect(same.controller.snapshot).toMatchObject({ goal: claudeFocusDocument.goal, freshness: "unreviewed" });
  expect(same.document?.freshness).toBe("unreviewed"); expect(same.document?.updatedAt).toBe(claudeFocusDocument.updatedAt);
  const other = fixture({ ...claudeFocusDocument, source: { ...claudeFocusDocument.source, sessionId: OTHER } }); await other.prompt();
  expect(other.controller.snapshot).toBeNull();
  expect(other.document).toMatchObject({ freshness: "unreviewed", goal: claudeFocusDocument.goal, source: { sessionId: OTHER } }); // runtime writes never adopt it
});

test("compaction keeps the binding; API failures retain old semantics as missed/interrupted", async () => {
  const f = fixture(); await f.prompt(); await f.focus("toolu_a");
  await f.hook({ event: "session_start", session_id: SESSION, source: "compact" });
  expect(f.resolved).toHaveLength(1); expect(f.controller.snapshot?.freshness).toBe("reviewed");
  await f.done("toolu_b");
  await f.hook({ event: "stop_failure", session_id: SESSION });
  expect(f.document).toMatchObject({ freshness: "missed", activity: { state: "interrupted" } });
});

test("parallel tool results during an update leave the snapshot uncovered", async () => {
  const f = fixture(); await f.prompt();
  const publish = f.transport.publish; let release!: () => void; let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  f.transport.publish = async (...args) => { if (args[1].freshness === "reviewed") { began(); await new Promise<void>(resolve => { release = resolve; }); } return publish(...args); };
  await f.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_focus", agent_id: "" });
  const pending = callTool(f.controller, CLAUDE_FOCUS_TOOL, { snapshot: focusSnapshot }, { [TOOL_USE_META]: "toolu_focus" }); await started;
  const sibling = f.done("toolu_sibling"); release();
  expect((await pending).isError).toBeUndefined(); await sibling; await f.done("toolu_focus");
  expect(refresh(await f.stop())).not.toBeNull();
});

test("binding and publication failures are visible, never synced, and keep the refresh bounded", async () => {
  const missing = fixture(null, null); await missing.prompt();
  const unavailable = await missing.focus("toolu_a");
  expect(unavailable.isError).toBe(true); expect(unavailable.content[0]!.text).toContain("CLAUDE_PROJECT_DIR");
  expect(missing.errors.length).toBeGreaterThan(0);
  const f = fixture(); f.transport.publish = async () => { throw new PublicationError("unavailable", "Wolfpack CLI rejected publication/identity (STORE_UNAVAILABLE)"); };
  await f.prompt();
  expect((await f.focus("toolu_a")).isError).toBe(true);
  const context = (await f.prompt(SESSION, "88888888-8888-4888-8888-888888888888")).content[0]!.text;
  expect(context).toContain("STORE_UNAVAILABLE");
  expect(refresh(await f.stop())).not.toBeNull(); expect(refresh(await f.stop())).toBeNull();
  expect(f.document).toBeNull();
});

test("coverage is per request even when Claude omits prompt_id and the unreviewed write fails", async () => {
  const f = fixture(); await f.prompt(SESSION, ""); await f.focus("toolu_a");
  expect(f.document?.source).toMatchObject({ promptId: null, coveredToolUseId: null });
  expect(refresh(await f.stop())).toBeNull();
  f.transport.publish = async () => { throw new PublicationError("unavailable", "fixture offline"); };
  await f.prompt(SESSION, "");
  expect(refresh(await f.stop())).not.toBeNull();
});


// --- review corrections D-01..D-04 ---
const failing = (transport: PublicationTransport, error: PublicationError) => { transport.resolve = async () => { throw error; }; };
test("D-01: an unverified or mismatched scope stays inert: no guidance, refresh, missed write or not-synced nag; tool errors stay honest", async () => {
  for (const error of [new PublicationError("unavailable", "Wolfpack CLI rejected publication/identity (CURRENT_CONTEXT_UNAVAILABLE)"), new PublicationError("invalid", "Expected exact verified claude Wolfpack session and project; no name/environment fallback")]) {
    const f = fixture(); failing(f.transport, error);
    for (const promptId of [PROMPT, "66666666-6666-4666-8666-666666666666"]) {
      expect((await f.prompt(SESSION, promptId)).content[0]!.text).toBe("");
      await f.done("toolu_work"); await f.batch();
      expect(refresh(await f.stop())).toBeNull();
    }
    const attempt = await f.focus("toolu_attempt");
    expect(attempt.isError).toBe(true); expect(attempt.content[0]!.text).toContain(error.message);
    expect(f.writes).toHaveLength(0); expect(f.errors.length).toBeGreaterThan(0);
    expect(await startupGuidance(f.transport, "/project")).toBe("");
  }
  const verified = fixture();
  expect(await startupGuidance(verified.transport, "/project")).toBe(CLAUDE_GUIDANCE);
  expect(await startupGuidance(verified.transport, undefined)).toBe("");
});

test("D-02: a transient first-bind failure recovers on the next request, once per request, without bind storms", async () => {
  const f = fixture(); const resolve = f.transport.resolve; let attempts = 0;
  f.transport.resolve = async (dir, signal) => { if (attempts++ === 0) throw new PublicationError("unavailable", "Wolfpack CLI rejected publication/identity (STORE_UNAVAILABLE)"); return resolve(dir, signal); };
  await f.prompt(); await f.done("toolu_work"); await f.batch();
  expect(refresh(await f.stop())).toBeNull(); expect(refresh(await f.stop())).toBeNull();
  expect(attempts).toBe(1); // hooks other than a request start never retry
  const recovered = await f.prompt(SESSION, "66666666-6666-4666-8666-666666666666");
  expect(attempts).toBe(2);
  expect(recovered.content[0]!.text).toContain(CLAUDE_GUIDANCE); // the model now learns the panel is active
  expect((await f.focus("toolu_recovered")).isError).toBeUndefined();
  expect(f.document).toMatchObject({ freshness: "reviewed", source: { harness: "claude", sessionId: SESSION } });
  await f.prompt(SESSION, "77777777-7777-4777-8777-777777777777");
  expect(attempts).toBe(2); // a healthy binding is not re-resolved
  const fence = fixture(); let calls = 0; fence.transport.resolve = async () => { calls++; throw new PublicationError("unavailable", "down"); };
  for (let i = 0; i < 3; i++) { await fence.prompt(SESSION, `8888888${i}-8888-4888-8888-888888888888`); await fence.stop(); await fence.done(`toolu_${i}`); }
  expect(calls).toBe(3);
});

test("D-03: a snapshot covers only results delivered to the model; same-batch siblings leave it immediately unreviewed", async () => {
  // Batch 1: [Bash, update_focus]. Bash's result lands before the focus PreToolUse and before execution.
  const f = fixture(); await f.prompt();
  await f.done("toolu_bash", true);
  const result = await f.focus("toolu_u");
  expect(result.isError).toBeUndefined();
  expect(f.document).toMatchObject({ freshness: "unreviewed", source: { promptId: PROMPT, coveredToolUseId: null } });
  await f.batch();
  expect(refresh(await f.stop())).not.toBeNull();
  // Refresh in the next batch covers the delivered failure result.
  await f.focus("toolu_cover"); await f.batch();
  expect(f.document).toMatchObject({ freshness: "reviewed", source: { coveredToolUseId: "toolu_bash" } });
  expect(refresh(await f.stop())).toBeNull();
  // A sibling arriving after the PreToolUse pin but while execution awaits the binding is not covered either.
  const g = fixture(); await g.prompt();
  await g.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_v", agent_id: "" });
  const pending = callTool(g.controller, CLAUDE_FOCUS_TOOL, { snapshot: focusSnapshot }, { [TOOL_USE_META]: "toolu_v" });
  await g.done("toolu_sibling");
  expect((await pending).isError).toBeUndefined(); await g.controller.settled(); await g.done("toolu_v"); await g.batch();
  expect(g.document).toMatchObject({ freshness: "unreviewed", source: { coveredToolUseId: null } });
  expect(refresh(await g.stop())).not.toBeNull();
  // Without any PostToolBatch (older runtime) coverage fails safe: stale, never falsely reviewed.
  const h = fixture(); await h.prompt(); await h.done("toolu_bash"); await h.focus("toolu_w");
  expect(h.document?.freshness).toBe("unreviewed"); expect(refresh(await h.stop())).not.toBeNull();
});

test("D-04: denied or unexecuted main-conversation maintenance loses prior coverage without loops; subagent pins and own success do not", async () => {
  const f = fixture(); await f.prompt();
  await f.focus("toolu_a", { snapshot: { ...focusSnapshot, needsYou: [] } }); await f.batch();
  expect(f.document?.freshness).toBe("reviewed");
  await f.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_sub", agent_id: "agent-1" }); await f.batch(SESSION, "agent-1");
  expect(f.document?.freshness).toBe("reviewed"); // a subagent's attempt is not main-conversation maintenance
  await f.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_denied", agent_id: "" }); // permission denied: never executes, no failure hook
  await f.batch();
  expect(f.document).toMatchObject({ freshness: "unreviewed", needsYou: [] });
  expect(refresh(await f.stop())).not.toBeNull();
  await f.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_denied_again", agent_id: "" }); await f.batch();
  expect(refresh(await f.stop())).toBeNull(); // budget spent: no loop
  expect(f.document).toMatchObject({ freshness: "missed", activity: { state: "idle" }, needsYou: [] });
  // Stop without a PostToolBatch (turn ended by the denial) still treats the pinned attempt as failed maintenance.
  const g = fixture(); await g.prompt(); await g.focus("toolu_a"); await g.batch();
  await g.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_denied", agent_id: "" });
  expect(refresh(await g.stop())).not.toBeNull();
  expect(g.document?.freshness).toBe("unreviewed");
});

test("unrecognized subagent metadata fails closed: no provenance pin, no delivered boundary, coverage unchanged", async () => {
  const f = fixture(); await f.prompt(); await f.focus("toolu_a"); await f.batch();
  expect((await f.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_odd", agent_id: "agent with spaces" })).isError).toBe(true);
  expect((await callTool(f.controller, CLAUDE_FOCUS_TOOL, { snapshot: focusSnapshot }, { [TOOL_USE_META]: "toolu_odd" })).isError).toBe(true);
  expect((await f.hook({ event: "tool_batch", session_id: SESSION, agent_id: "agent/../x" })).isError).toBe(true);
  expect(f.document?.freshness).toBe("reviewed"); // the rejected call never ran and was not a main-conversation pin
});

test("D-02: guidance withheld at a failed start is delivered once after a slow recovery, at the next batch end", async () => {
  const f = fixture(); const resolve = f.transport.resolve; let attempts = 0; let release!: () => void;
  f.transport.resolve = async (dir, signal) => {
    if (attempts++ === 0) throw new PublicationError("unavailable", "down");
    await new Promise<void>(done => { release = done; }); return resolve(dir, signal);
  };
  await f.prompt();
  // Direct dispatch: the fixture's hook helper would also wait for background work blocked on the bind.
  const prompting = callTool(f.controller, CLAUDE_LIFECYCLE_TOOL, { event: "prompt", session_id: SESSION, prompt_id: "66666666-6666-4666-8666-666666666666" }, undefined);
  expect((await prompting).content[0]!.text).toBe(""); // bounded wait elapsed while the bind is still in flight
  release(); await f.controller.settled();
  expect(JSON.parse((await f.batch()).content[0]!.text)).toEqual({ hookSpecificOutput: { hookEventName: "PostToolBatch", additionalContext: CLAUDE_GUIDANCE } });
  expect((await f.batch()).content[0]!.text).toBe("");
  expect((await f.prompt(SESSION, "77777777-7777-4777-8777-777777777777")).content[0]!.text).toBe("");
  expect(attempts).toBe(2);
}, 10_000);

test("D-02: a slow first bind still in flight at the next request announces the panel once it verifies", async () => {
  const f = fixture(); const resolve = f.transport.resolve; let release!: () => void;
  f.transport.resolve = async (dir, signal) => { await new Promise<void>(done => { release = done; }); return resolve(dir, signal); };
  const first = callTool(f.controller, CLAUDE_LIFECYCLE_TOOL, { event: "prompt", session_id: SESSION, prompt_id: PROMPT }, undefined);
  expect((await first).content[0]!.text).toBe(""); // a normal first request does not wait
  const second = callTool(f.controller, CLAUDE_LIFECYCLE_TOOL, { event: "prompt", session_id: SESSION, prompt_id: "66666666-6666-4666-8666-666666666666" }, undefined);
  release();
  expect((await second).content[0]!.text).toBe(CLAUDE_GUIDANCE);
  await f.controller.settled(); expect((await f.batch()).content[0]!.text).toBe("");
});


test("RR-01: a pin abandoned by an earlier request cannot execute or stale the next request's coverage", async () => {
  const f = fixture(); await f.prompt();
  await f.hook({ event: "pre_focus", session_id: SESSION, tool_use_id: "toolu_abandoned", agent_id: "" }); // denied; turn ended without batch end or Stop
  await f.prompt(SESSION, "66666666-6666-4666-8666-666666666666");
  expect((await f.focus("toolu_ok")).isError).toBeUndefined(); await f.batch();
  expect(f.document).toMatchObject({ freshness: "reviewed", source: { promptId: "66666666-6666-4666-8666-666666666666", coveredToolUseId: null } });
  expect(refresh(await f.stop())).toBeNull();
  expect((await callTool(f.controller, CLAUDE_FOCUS_TOOL, { snapshot: focusSnapshot }, { [TOOL_USE_META]: "toolu_abandoned" })).isError).toBe(true);
  await f.done("toolu_abandoned", true); await f.batch(); // a late native failure event for it is not new work either
  expect(f.document?.freshness).toBe("reviewed");
});

test("RR-02: the always-loaded tool description is conditional on a verified Wolfpack session", () => {
  const description = CLAUDE_TOOLS.find(tool => tool.name === CLAUDE_FOCUS_TOOL)!.description;
  expect(description).toStartWith("Only for a verified Wolfpack session");
  expect(description).toContain("Do not call it otherwise");
  expect(description).not.toMatch(/^Maintain/);
});

import { expect, test } from "bun:test";
import { FocusCompanion, type CompanionContext } from "../src/companion.ts";
import { FocusPublisher, PublicationError, type PublicationTransport } from "../src/publisher.ts";
import { focusSnapshot } from "./focus-fixture.ts";
import type { FocusDocument } from "../src/focus.ts";
function fixture() {
  let document: FocusDocument | null = null; let revision = 0;
  const transport: PublicationTransport = { resolve: async projectDir => ({ sessionId: "scope", projectDir }), read: async () => ({ document, revision }), publish: async (_scope, value) => { document = value; return { revision: ++revision }; } };
  const entries: any[] = [{ id: "u1", type: "message", message: { role: "user" } }];
  const context: CompanionContext = { cwd: "/project", sessionManager: { getSessionId: () => "pi", getLeafId: () => entries.at(-1)?.id ?? null, getBranch: () => entries } };
  const errors: string[] = [];
  const companion = new FocusCompanion(new FocusPublisher(transport), (customType, data) => entries.push({ id: `persist-${entries.length}`, type: "custom", customType, data }), error => errors.push(error));
  return { companion, context, entries, errors, transport, get document() { return document; } };
}
test("automatic guidance precedes work; a missed update gets only one guarded final refresh", async () => {
  const f = fixture(); await f.companion.start(f.context);
  expect(await f.companion.beforeRun(f.context)).toContain("update_focus");
  const first = await f.companion.beforeSettle(f.context, { outcome: "completed", canContinue: false }); // The new custom message itself supplies continuation context.
  expect(first).toMatchObject({ continue: true, entries: [{ type: "custom_message", display: false }] });
  expect(await f.companion.beforeSettle(f.context, { outcome: "completed", canContinue: true })).toBeUndefined();
  expect(f.document).toBeNull();
});
test("questions clear through structured snapshots; runtime settlement never completes semantic work", async () => {
  const f = fixture(); await f.companion.start(f.context); await f.companion.beforeRun(f.context);
  await f.companion.update(f.context, focusSnapshot);
  expect(f.document?.needsYou).toHaveLength(1);
  expect(f.document?.source).toEqual({ harness: "pi", sessionId: "pi", branchId: "u1", coveredEntryId: "u1" });
  await f.companion.update(f.context, { ...focusSnapshot, needsYou: [] });
  expect(f.document?.needsYou).toHaveLength(0);
  const semanticTime = f.document?.updatedAt;
  await f.companion.settled(f.context, false);
  expect(f.document?.activity.state).toBe("idle"); expect(f.document?.now).toEqual(focusSnapshot.now); expect(f.document?.updatedAt).toBe(semanticTime);
  expect(await f.companion.beforeSettle(f.context, { outcome: "completed", canContinue: true })).toBeUndefined();
});
test("later user/tool boundaries mark old semantics stale and aborted runs do not trigger refresh", async () => {
  const f = fixture(); await f.companion.start(f.context); await f.companion.update(f.context, focusSnapshot);
  f.entries.push({ id: "tool-1", type: "message", message: { role: "toolResult", toolName: "bash" } });
  await f.companion.turnEnd(f.context); expect(f.document?.freshness).toBe("unreviewed");
  expect(await f.companion.beforeSettle(f.context, { outcome: "aborted", canContinue: true })).toBeUndefined();
  await f.companion.settled(f.context, true); expect(f.document?.activity.state).toBe("interrupted");
  expect(f.document?.freshness).toBe("missed");
});
test("resume/compaction reconstruct only active branch entries", async () => {
  const f = fixture(); await f.companion.start(f.context); await f.companion.update(f.context, focusSnapshot);
  const time = f.document?.updatedAt;
  f.entries.push({ id: "compact", type: "compaction" });
  await f.companion.start(f.context);
  expect(f.document?.goal).toBe(focusSnapshot.goal); expect(f.document?.updatedAt).toBe(time); expect(f.document?.freshness).toBe("unreviewed");
  f.entries.splice(1); f.companion.invalidate(); await f.companion.start(f.context);
  expect(f.companion.snapshot).toBeNull();
});


test("delayed prior before-run initialization cannot maintain or inject into the replacement binding", async () => {
  const f = fixture(); const resolve = f.transport.resolve; let release!: () => void; let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  f.transport.resolve = async (...args) => { began(); await new Promise<void>(resolve => { release = resolve; }); return resolve(...args); };
  const oldRun = f.companion.beforeRun(f.context); await started;
  f.transport.resolve = resolve; await f.companion.start(f.context); release();
  await expect(oldRun).rejects.toMatchObject({ code: "superseded" });
});
test("delayed old tool completion cannot append accepted branch state after invalidation", async () => {
  const f = fixture(); await f.companion.start(f.context); const publish = f.transport.publish;
  let release!: () => void; let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  f.transport.publish = async (...args) => { began(); await new Promise<void>(resolve => { release = resolve; }); return publish(...args); };
  const updating = f.companion.update(f.context, focusSnapshot); await started;
  f.companion.invalidate(); release(); await expect(updating).rejects.toMatchObject({ code: "superseded" });
  expect(f.entries.filter(entry => entry.type === "custom")).toHaveLength(0);
});


for (const failure of ["publication", "parameter validation"] as const) test(`failed focus ${failure} after a same-request success invalidates coverage until a covering update`, async () => {
  const f = fixture(); await f.companion.start(f.context); await f.companion.beforeRun(f.context);
  await f.companion.update(f.context, { ...focusSnapshot, needsYou: [] });
  const semanticTime = f.document!.updatedAt; const originalFocus = f.document!.now;
  if (failure === "publication") {
    const publish = f.transport.publish;
    f.transport.publish = async () => { throw new PublicationError("unavailable", "transient fixture failure"); };
    await expect(f.companion.update(f.context, { ...focusSnapshot, needsYou: [{ id: "approval", text: "Approve before proceeding" }] })).rejects.toThrow("transient fixture failure");
    f.transport.publish = publish;
  } // Parameter validation fails in Pi before execute; only its structured failed result reaches the branch.
  f.entries.push({ id: "failed-focus", type: "message", message: { role: "toolResult", toolName: "update_focus", isError: true } });
  await f.companion.turnEnd(f.context);
  expect(f.document?.freshness).toBe("unreviewed"); expect(f.document?.updatedAt).toBe(semanticTime);
  expect(f.document?.needsYou).toEqual([]); expect(f.document?.now).toEqual(originalFocus);
  expect(await f.companion.beforeSettle(f.context, { outcome: "completed", canContinue: false })).toMatchObject({ continue: true });
  expect(await f.companion.beforeSettle(f.context, { outcome: "completed", canContinue: false })).toBeUndefined();
  await f.companion.settled(f.context, false);
  expect(f.document?.freshness).toBe("missed"); expect(f.document?.updatedAt).toBe(semanticTime);
  await f.companion.update(f.context, focusSnapshot);
  f.entries.push({ id: "successful-focus", type: "message", message: { role: "toolResult", toolName: "update_focus", isError: false } });
  await f.companion.turnEnd(f.context);
  expect(f.document?.source).toEqual({ harness: "pi", sessionId: "pi", branchId: "u1", coveredEntryId: "failed-focus" }); expect(f.document?.freshness).toBe("reviewed");
  expect(f.document?.needsYou).toEqual(focusSnapshot.needsYou);
  expect(await f.companion.beforeSettle(f.context, { outcome: "completed", canContinue: false })).toBeUndefined();
});

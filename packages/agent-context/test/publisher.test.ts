import { expect, test } from "bun:test";
import { FocusPublisher, PublicationError, type PublicationTransport } from "../src/publisher.ts";
import { focusDocument, focusSnapshot } from "./focus-fixture.ts";
import type { FocusDocument } from "../src/focus.ts";
const sessionId = "11111111-1111-4111-8111-111111111111";
function fixture() {
  let revision = 0; let document: FocusDocument | null = null; let lost = 0;
  const receipts = new Map<string, { revision: number }>(); const attempts: Array<{ requestId: string; document: FocusDocument; baseRevision: number }> = [];
  const transport: PublicationTransport = {
    resolve: async () => ({ sessionId, projectDir: "/project" }),
    read: async () => ({ revision, document }),
    publish: async (_scope, value, baseRevision, requestId) => {
      attempts.push({ requestId, document: structuredClone(value), baseRevision });
      const duplicate = receipts.get(requestId); if (duplicate) return duplicate;
      if (baseRevision !== revision) throw new PublicationError("conflict", "changed");
      document = structuredClone(value); revision++; const receipt = { revision }; receipts.set(requestId, receipt);
      if (lost-- > 0) throw new PublicationError("ambiguous", "lost response");
      return receipt;
    },
  };
  const publisher = new FocusPublisher(transport, () => "2026-02-01T00:00:00.000Z");
  const binding = { harness: "pi" as const, sessionId: "pi-session", projectDir: "/project" };
  const source = (coveredEntryId: string | null, branchId: string | null = "branch-entry") => ({ harness: "pi" as const, sessionId: "pi-session", branchId, coveredEntryId });
  return { publisher, transport, attempts, binding, source, get document() { return document; }, set document(value) { document = value; revision++; }, loseResponse() { lost++; } };
}
test("structured updates dedupe; activity does not refresh semantics or invent completion", async () => {
  const f = fixture(); await f.publisher.bind(f.binding);
  await f.publisher.update(focusSnapshot, f.source("user-entry"));
  expect(f.document?.freshness).toBe("reviewed");
  await f.publisher.update(focusSnapshot, f.source("user-entry")); expect(f.attempts).toHaveLength(1);
  const updatedAt = f.document!.updatedAt;
  await f.publisher.activity("idle");
  expect(f.document?.updatedAt).toBe(updatedAt); expect(f.document?.now).toEqual(focusSnapshot.now);
  await f.publisher.markUnreviewed(); expect(f.document?.freshness).toBe("unreviewed");
});
test("lost-response retries the identical request id, payload and CAS base", async () => {
  const f = fixture(); await f.publisher.bind(f.binding); f.loseResponse();
  await f.publisher.update(focusSnapshot, f.source("user-entry"));
  expect(f.attempts).toHaveLength(2); expect(f.attempts[1]).toEqual(f.attempts[0]);
  expect(f.publisher.document?.goal).toBe(focusSnapshot.goal);
});
test("conflicts re-read and expose current state; no blind overwrite without explicit reconciliation", async () => {
  const f = fixture(); await f.publisher.bind(f.binding); await f.publisher.update(focusSnapshot, f.source("user-entry"));
  f.document = { ...focusDocument, goal: "Other writer" };
  await expect(f.publisher.update({ ...focusSnapshot, goal: "Our new goal" }, f.source("user-2"))).rejects.toMatchObject({ code: "conflict", current: { revision: 2, document: { goal: "Other writer" } } });
  expect(f.document?.goal).toBe("Other writer"); expect(f.attempts).toHaveLength(1);
  await f.publisher.update({ ...focusSnapshot, goal: "Reconciled goal" }, f.source("user-2"), 2);
  expect(f.document?.goal).toBe("Reconciled goal");
});
test("branch changes invalidate a delayed old binding before it can publish", async () => {
  const f = fixture(); let release!: () => void;
  const original = f.transport.read;
  f.transport.read = async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return original(...args); };
  const binding = f.publisher.bind(f.binding); await Promise.resolve(); await Promise.resolve();
  f.publisher.invalidate(); release(); await expect(binding).rejects.toMatchObject({ code: "superseded" });
  expect(f.attempts).toHaveLength(0);
});
test("resume uses branch-local persisted content, never remote content as semantic truth", async () => {
  const f = fixture(); f.document = { ...focusDocument, goal: "Abandoned branch" };
  let offered: unknown;
  await f.publisher.bind(f.binding, remote => { offered = remote; return { ...focusDocument, source: { ...focusDocument.source, branchId: "new-branch" } }; });
  expect((offered as typeof focusDocument).goal).toBe("Abandoned branch"); // Remote is offered as evidence; the adapter decides.
  await f.publisher.activity("unknown");
  expect(f.document?.goal).toBe("Abandoned branch"); // Runtime may not replace semantic content.
  expect(f.publisher.document?.goal).toBe(focusDocument.goal);
  await f.publisher.markUnreviewed();
  expect(f.document?.freshness).toBe("unreviewed");
  await f.publisher.update(focusSnapshot, f.source("new-user", "new-branch"));
  expect(f.document?.goal).toBe(focusDocument.goal);
  expect(f.document?.source).toMatchObject({ harness: "pi", branchId: "new-branch" });
});


test("an identical semantic snapshot still detects another writer and supports explicit reconciliation", async () => {
  const f = fixture(); await f.publisher.bind(f.binding); await f.publisher.update(focusSnapshot, f.source("user-entry"));
  f.document = { ...focusDocument, goal: "Other writer" };
  await expect(f.publisher.update(focusSnapshot, f.source("user-entry"))).rejects.toMatchObject({ code: "conflict" });
  await f.publisher.update(focusSnapshot, f.source("user-entry"), 2);
  expect(f.document?.goal).toBe(focusSnapshot.goal);
});
test("unresolved lost responses never mark synced; later retry retains the original operation", async () => {
  const f = fixture(); const publish = f.transport.publish; let drops = 2;
  f.transport.publish = async (...args) => { const receipt = await publish(...args); if (drops-- > 0) throw new PublicationError("ambiguous", "response lost"); return receipt; };
  await f.publisher.bind(f.binding);
  await expect(f.publisher.update(focusSnapshot, f.source("user-entry"))).rejects.toMatchObject({ code: "ambiguous" });
  expect(f.publisher.document).toBeNull();
  await f.publisher.update(focusSnapshot, f.source("user-entry"));
  expect(f.attempts).toHaveLength(3); expect(f.attempts[2]).toEqual(f.attempts[0]);
});
test("queued mutations serialize and cancelled old reads cannot publish after rebinding", async () => {
  const f = fixture(); await f.publisher.bind(f.binding);
  const read = f.transport.read; let release!: () => void; let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  f.transport.read = async (...args) => { began(); await new Promise<void>(resolve => { release = resolve; }); return read(...args); };
  const first = f.publisher.update(focusSnapshot, f.source("user-entry")); await started;
  const second = f.publisher.update({ ...focusSnapshot, goal: "Second" }, f.source("user-entry"));
  expect(f.attempts).toHaveLength(0); f.publisher.invalidate(); release();
  await expect(first).rejects.toMatchObject({ code: "superseded" });
  await expect(second).rejects.toMatchObject({ code: "superseded" }); expect(f.attempts).toHaveLength(0);
});
test("tool cancellation after a delayed read fences publication even if the transport ignores abort", async () => {
  const f = fixture(); await f.publisher.bind(f.binding);
  const read = f.transport.read; let release!: () => void; let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  f.transport.read = async (...args) => { began(); await new Promise<void>(resolve => { release = resolve; }); return read(...args); };
  const abort = new AbortController(); const updating = f.publisher.update(focusSnapshot, f.source("user-entry"), undefined, abort.signal); await started;
  abort.abort(); release(); await expect(updating).rejects.toMatchObject({ code: "superseded" }); expect(f.attempts).toHaveLength(0);
});


test("first semantic update preserves independently observed activity instead of inventing working", async () => {
  const f = fixture(); await f.publisher.bind(f.binding); await f.publisher.activity("idle");
  await f.publisher.update(focusSnapshot, f.source("user-entry"));
  expect(f.document?.activity.state).toBe("idle");
});


test("producer identity is pinned: another harness/session or restored provenance fails closed before publication", async () => {
  const f = fixture(); await f.publisher.bind(f.binding);
  for (const source of [
    { harness: "claude" as const, sessionId: "pi-session", promptId: null, coveredToolUseId: null },
    { harness: "pi" as const, sessionId: "other-session", branchId: null, coveredEntryId: null },
  ]) await expect(f.publisher.update(focusSnapshot, source)).rejects.toMatchObject({ code: "invalid" });
  expect(f.attempts).toHaveLength(0);
  await expect(f.publisher.bind(f.binding, () => ({ ...focusDocument, source: { ...focusDocument.source, sessionId: "other-session" } }))).rejects.toMatchObject({ code: "invalid" });
  expect(f.publisher.document).toBeNull();
});
test("a different boundary is a new semantic review even with identical snapshot content", async () => {
  const f = fixture(); await f.publisher.bind(f.binding);
  await f.publisher.update(focusSnapshot, f.source("user-entry"));
  await f.publisher.update(focusSnapshot, f.source("tool-entry"));
  expect(f.attempts).toHaveLength(2); expect(f.document?.source.harness === "pi" && f.document.source.coveredEntryId).toBe("tool-entry");
});

import { expect, test } from "bun:test";
import { contextViewModel } from "../src/model.ts";
import { claudeFocusDocument, focusDocument } from "./focus-fixture.ts";
import { canonical, isFocusDocument } from "../src/focus.ts";

test("canonical receipt digest uses host code-unit key ordering, not locale ordering", () => {
  expect(canonical({ needsYou: [], needToKnow: [] })).toBe('{"needToKnow":[],"needsYou":[]}');
});
test("v3 carries typed focus, ownership, bounded history and independent freshness/activity", () => {
  expect(contextViewModel(focusDocument, 3)).toMatchObject({ state: "focus", revision: 3, document: focusDocument });
  expect(contextViewModel({ ...focusDocument, activity: { state: "idle", observedAt: "2026-02-01T00:00:00.000Z" } }, 4)).toMatchObject({ state: "focus", document: { updatedAt: focusDocument.updatedAt } });
});
test("v3 provenance names the exact harness and only that harness's boundary fields", () => {
  expect(isFocusDocument(focusDocument)).toBe(true);
  expect(isFocusDocument(claudeFocusDocument)).toBe(true);
  expect(isFocusDocument({ ...claudeFocusDocument, source: { ...claudeFocusDocument.source, promptId: null, coveredToolUseId: null } })).toBe(true);
  for (const source of [
    { piSessionId: "pi-session", branchId: null, coveredEntryId: null }, // v2 Pi-only provenance
    { ...focusDocument.source, harness: "claude" }, // Pi branch fields under another harness
    { ...claudeFocusDocument.source, harness: "pi" },
    { ...claudeFocusDocument.source, branchId: null }, // invented Pi field on Claude provenance
    { ...focusDocument.source, promptId: null },
    { ...claudeFocusDocument.source, harness: "codex" },
    { harness: "claude", sessionId: "", promptId: null, coveredToolUseId: null },
    { ...claudeFocusDocument.source, coveredToolUseId: "t".repeat(129) },
  ]) expect(isFocusDocument({ ...focusDocument, source })).toBe(false);
});
test("incompatible focus producers and duplicate stable ids fail explicitly", () => {
  for (const document of [
    { ...focusDocument, schemaVersion: 2 }, { ...focusDocument, schemaVersion: 4 }, { ...focusDocument, nextSteps: [{ id: "n", text: "No owner" }] },
    { ...focusDocument, needsYou: [focusDocument.needsYou[0], focusDocument.needsYou[0]] },
    { ...focusDocument, needToKnow: Array.from({ length: 21 }, (_, i) => ({ id: String(i), text: "fact" })) },
    { ...focusDocument, updatedAt: "yesterday" }, { ...focusDocument, freshness: "live" },
    { ...focusDocument, now: { id: "n", text: "x".repeat(241) } },
  ]) expect(contextViewModel(document, 2)).toMatchObject({ state: "error" });
});

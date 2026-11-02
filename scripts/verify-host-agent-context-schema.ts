#!/usr/bin/env bun
/** Release-only schema-v3 contract check against the explicitly selected host validator. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeFocusDocument, focusDocument } from "../packages/agent-context/test/focus-fixture.ts";
const host = process.env.WOLFPACK_EXTENSION_HOST_ROOT;
if (!host) throw new Error("set WOLFPACK_EXTENSION_HOST_ROOT to the selected APIv1 host");
const schema = readFileSync(join(import.meta.dirname, "..", "packages", "agent-context", "schemas", "context.schema.json"));
if (createHash("sha256").update(schema).digest("hex") !== "d6e0af21b7d8a0d3127cd714b30a500a1358115bbdb4ccda9fba6283afd2ab29") throw new Error("frozen Agent Context v3 schema bytes changed");
const { compileStaticDocumentSchema, validateDocumentPayload } = await import(join(host, "src/extensions/document-contract.ts"));
const validator = compileStaticDocumentSchema(JSON.parse(schema.toString()));
for (const value of [focusDocument, claudeFocusDocument, { ...claudeFocusDocument, source: { ...claudeFocusDocument.source, promptId: null, coveredToolUseId: null } }, { ...focusDocument, needsYou: [], needToKnow: [], nextSteps: [], history: [], source: { ...focusDocument.source, branchId: null, coveredEntryId: null }, activity: { state: "interrupted", observedAt: focusDocument.updatedAt }, freshness: "missed" }]) validateDocumentPayload(value, validator);
const invalid = [
  { schemaVersion: 1, goal: "Legacy", planItems: [], decisions: [], blockers: [], nextSteps: [] },
  { ...focusDocument, now: { id: "focus", text: "x".repeat(241) } },
  { ...focusDocument, nextSteps: [{ id: "next", text: "Missing owner" }] },
  { ...focusDocument, nextSteps: [{ id: "next", text: "Bad owner", owner: "nobody" }] },
  { ...focusDocument, needToKnow: Array.from({ length: 21 }, (_, i) => ({ id: String(i), text: "fact" })) },
  { ...focusDocument, history: [{ id: "h", text: "Bad kind", kind: "task" }] },
  { ...focusDocument, updatedAt: "yesterday" },
  { ...focusDocument, freshness: "live" },
  { ...focusDocument, activity: { state: "completed", observedAt: focusDocument.updatedAt } },
  { ...focusDocument, source: { ...focusDocument.source, guessedSession: "name" } },
  { ...focusDocument, schemaVersion: 2, source: { piSessionId: "pi-session", branchId: null, coveredEntryId: null } },
  { ...focusDocument, source: { ...focusDocument.source, harness: "claude" } },
  { ...claudeFocusDocument, source: { ...claudeFocusDocument.source, branchId: null } },
  { ...claudeFocusDocument, source: { ...claudeFocusDocument.source, harness: "codex" } },
  { ...claudeFocusDocument, source: { harness: "claude", promptId: null, coveredToolUseId: null } },
  { ...focusDocument, needsYou: Array.from({ length: 20 }, (_, i) => ({ id: String(i), text: "x".repeat(240), details: "界".repeat(2000) })) },
];
for (const value of invalid) { let rejected = false; try { validateDocumentPayload(value, validator); } catch { rejected = true; } if (!rejected) throw new Error("selected host accepted invalid Agent Context v2 payload"); }
process.stdout.write(`selected host accepts schema-v3 Pi/Claude provenance and independent activity/freshness; rejects ${invalid.length} incompatible/confused/over-budget payloads (v1 display-only)\n`);

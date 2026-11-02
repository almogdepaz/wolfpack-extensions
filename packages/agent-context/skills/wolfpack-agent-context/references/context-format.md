# Focus document v3

`update_focus` accepts `{ snapshot, reconcileRevision? }`. `snapshot` contains exactly these semantic fields (illustrative, not live state):

```json
{
  "goal": "Keep session context useful without check-ins",
  "now": { "id": "publisher", "text": "Build automatic publication", "details": "So the panel follows meaningful changes." },
  "needsYou": [{ "id": "review", "text": "Review the narrow panel", "details": "Choose whether this meets your needs." }],
  "needToKnow": [{ "id": "local", "text": "Changes are local; nothing installed" }],
  "nextSteps": [{ "id": "test", "text": "Test resume", "owner": "agent" }],
  "history": [{ "id": "decision", "text": "Use structured updates", "kind": "decision" }]
}
```

- Goal: one stable desired outcome, 1–1000 characters. Now: one primary focus, with optional rationale in `details`.
- Every item: stable unique-in-section `id` (1–128 characters), concise `text` headline (1–240), optional nonempty `details` (up to 2000). Use separate fields, not magic prefixes or reparsed prose. No HTML/Markdown execution.
- `needsYou`: up to 20 actual questions, decisions, approvals or actions the user can resolve. All are visible; do not relabel ordinary technical blockers as user obligations. Empty means “no action requested in this update” only when reviewed; unknown/missed updates never promise nothing is needed.
- `needToKnow`: up to 20 current decision-relevant facts/constraints/discoveries/blockers. Prefer three; additional critical items remain accessible, not silently truncated.
- `nextSteps`: at most three ordered intentions, each with explicit `owner: "agent" | "user"`. These confer no execution authority.
- `history`: up to 20 bounded recent items with `kind: "decision" | "completed"`; collapsed by default. Agent-reported completion requires actual evidence, never idle/publication inference. Not a transcript or second project task database.
- Use empty arrays for absent lists. Do not fill space with invented blockers, details or evidence. Keep IDs stable through wording changes/reordering; local draft text is browser-only and has not been communicated to the agent.

The Pi companion or Claude Code plugin validates and adds the wire fields:

- `schemaVersion: 3`;
- `source`: exactly one producer shape, never mixed:
  - Pi: `{ harness: "pi", sessionId, branchId, coveredEntryId }`: exact Pi session and branch anchor plus covered structured user/tool entry; may be null at an empty root;
  - Claude Code: `{ harness: "claude", sessionId, promptId, coveredToolUseId }`: exact native session id, the request's native `prompt_id` (null when Claude omits it) and the last tool result already delivered to the model when it issued the update (null when the snapshot follows the prompt directly). Successful self-maintenance is never a boundary; failed or denied maintenance is;
- `updatedAt`: canonical UTC ISO timestamp of the last semantic review;
- `freshness: "reviewed" | "unreviewed" | "missed"`: reviewed at that update, not an assurance that later work is covered;
- `activity: { state: "working" | "idle" | "interrupted" | "unknown", observedAt }`: independently dated last observed runtime activity, never live presence or semantic completion.

The complete UTF-8 document must fit 64 KiB and the host's depth/node budgets even when all individual fields fit. Extra properties, incompatible versions, duplicate IDs, malformed timestamps and missing owners are rejected by the producer/browser; the host independently applies the shipped bounded static schema. Strings are inert data: no credentials, raw transcripts, hidden reasoning or fabricated verification evidence.

`schemas/context.schema.json` is the v3 wire contract, frozen by package-gate digest. Legacy v1 display support never fabricates typed current focus, ownership or freshness; v2 Pi-only documents are not reinterpreted. Publishing v3 into an older installed schema fails explicitly; clean reinstall is an operator deployment decision, not data publication.

export const focusDocument = {
  schemaVersion: 3 as const,
  goal: "Keep session context useful without check-ins",
  now: { id: "publisher", text: "Build automatic publication", details: "So the panel follows meaningful changes." },
  needsYou: [{ id: "review", text: "Review the narrow panel", details: "Choose whether this meets your needs." }],
  needToKnow: [{ id: "local", text: "Changes are local; nothing installed" }],
  nextSteps: [{ id: "test", text: "Test resume", owner: "agent" as const }],
  history: [{ id: "decision", text: "Use structured updates", kind: "decision" as const }],
  source: { harness: "pi" as const, sessionId: "pi-session", branchId: "branch-entry", coveredEntryId: "user-entry" },
  updatedAt: "2026-01-01T00:00:00.000Z",
  freshness: "reviewed" as const,
  activity: { state: "working" as const, observedAt: "2026-01-01T00:00:00.000Z" },
};
export const claudeFocusDocument = {
  ...focusDocument,
  source: { harness: "claude" as const, sessionId: "33333333-3333-4333-8333-333333333333", promptId: "44444444-4444-4444-8444-444444444444", coveredToolUseId: "toolu_01fixture" },
};
export const { goal, now, needsYou, needToKnow, nextSteps, history } = focusDocument;
export const focusSnapshot = { goal, now, needsYou, needToKnow, nextSteps, history };

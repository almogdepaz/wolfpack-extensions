import { isFocusDocument, type FocusDocument, type FocusSnapshot, type FocusSource } from "./focus.ts";
import { FocusPublisher, PublicationError } from "./publisher.ts";
export const FOCUS_STATE_ENTRY = "wolfpack-agent-context-state-v3"; // schema-v2 entries are not reinterpreted
export const FOCUS_REFRESH_MESSAGE = "wolfpack-agent-context-refresh";
export const FOCUS_TOOL = "update_focus";
export interface BranchEntry { readonly id: string; readonly type: string; readonly customType?: string; readonly data?: unknown; readonly message?: { readonly role: string; readonly toolName?: string; readonly isError?: boolean; readonly details?: unknown } }
export interface CompanionContext { readonly cwd: string; readonly sessionManager: { getSessionId(): string; getLeafId(): string | null; getBranch(): readonly BranchEntry[] } }
/** Read only structured entry identity/role, never extract semantic content from transcripts. */
export function conversationBoundary(ctx: CompanionContext): string | null {
  let boundary: string | null = null;
  // Successful self-maintenance must not require another update; failed results (including
  // Pi argument validation before execute) invalidate an earlier same-request snapshot.
  for (const entry of ctx.sessionManager.getBranch()) if (entry.type === "message" && (entry.message?.role === "user" || entry.message?.role === "toolResult" && (entry.message.toolName !== FOCUS_TOOL || entry.message.isError === true))) boundary = entry.id;
  return boundary;
}
export interface RefreshContinuation { continue: true; entries: [{ type: "custom_message"; customType: string; display: false; content: string }] }
export class FocusCompanion {
  private epoch = 0;
  private sessionId?: string;
  private branchId: string | null = null;
  private ready = false;
  private refreshUsed = false;
  private lastError?: string;
  constructor(private readonly publisher: FocusPublisher, private readonly append: (type: string, data: unknown) => void, private readonly report: (message: string) => void) {}
  get snapshot(): FocusDocument | null { return this.publisher.document; }
  invalidate(): void { this.epoch++; this.ready = false; this.sessionId = undefined; this.publisher.invalidate(); }
  private check(ctx: CompanionContext, epoch: number): void {
    if (epoch !== this.epoch || ctx.sessionManager.getSessionId() !== this.sessionId) throw new PublicationError("superseded", "Old Pi session/branch callback discarded");
  }
  private fail(error: unknown): void { this.lastError = error instanceof Error ? error.message : "Automatic focus publication failed"; this.report(this.lastError); }
  async start(ctx: CompanionContext): Promise<void> {
    this.invalidate(); const epoch = this.epoch; const sessionId = this.sessionId = ctx.sessionManager.getSessionId(); this.refreshUsed = false;
    const branchId = this.branchId = ctx.sessionManager.getLeafId();
    let restored: FocusDocument | undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === FOCUS_STATE_ENTRY && isFocusDocument(entry.data) && entry.data.source.harness === "pi") restored = entry.data;
    }
    try {
      // Active-branch Pi entries are semantic truth; a fork/tree move re-anchors them to the current session/branch.
      await this.publisher.bind({ harness: "pi", sessionId, projectDir: ctx.cwd }, () => restored && { ...restored, source: { ...restored.source, sessionId, branchId } }); this.check(ctx, epoch);
      this.ready = true; this.lastError = undefined;
      await this.publisher.markUnreviewed(); this.check(ctx, epoch);
      await this.publisher.activity("unknown"); this.check(ctx, epoch);
    } catch (error) { if (epoch === this.epoch) this.fail(error); }
  }
  async beforeRun(ctx: CompanionContext): Promise<string> {
    let epoch = this.epoch;
    if (!this.ready || this.sessionId !== ctx.sessionManager.getSessionId()) {
      const starting = this.start(ctx); epoch = this.epoch; await starting;
    }
    this.check(ctx, epoch); this.refreshUsed = false;
    await this.observe(() => this.publisher.markUnreviewed()); this.check(ctx, epoch);
    return [
      `Maintain this session's Wolfpack focus panel automatically with ${FOCUS_TOOL}; no separate user request is needed.`,
      "Publish before substantive work, at meaningful changes and before your final reply. Keep goal/IDs stable. Report now/rationale, explicit user actions (clear resolved ones), critical facts, up to three owner-tagged next steps, and bounded decisions/completed history.",
      "No secrets, transcripts, hidden reasoning, invented evidence or completion inferred from idle/publication. Next steps are intentions, not authority. On conflict inspect current state, reconcile and supply reconcileRevision; never blindly replace another writer.",
      this.lastError ? `Automatic publication unavailable: ${this.lastError}. Explain the limitation; do not claim synced.` : "Publication receipts confirm storage, not browser rendering or completed work.",
    ].join("\n");
  }
  async update(ctx: CompanionContext, snapshot: FocusSnapshot, reconcileRevision?: number, signal?: AbortSignal): Promise<FocusDocument> {
    const epoch = this.epoch; this.check(ctx, epoch);
    if (!this.ready) throw new PublicationError("unavailable", this.lastError ?? "No verified focus binding");
    const accepted = await this.publisher.update(snapshot, this.source(ctx), reconcileRevision, signal); this.check(ctx, epoch);
    this.append(FOCUS_STATE_ENTRY, accepted); this.lastError = undefined; return accepted;
  }
  private async observe(work: () => Promise<void>): Promise<void> {
    if (!this.ready) return;
    const epoch = this.epoch;
    try { await work(); } catch (error) { if (epoch === this.epoch) this.fail(error); }
  }
  async working(ctx: CompanionContext): Promise<void> { if (this.sessionId === ctx.sessionManager.getSessionId()) await this.observe(() => this.publisher.activity("working")); }
  private source(ctx: CompanionContext): Extract<FocusSource, { harness: "pi" }> { return { harness: "pi", sessionId: this.sessionId!, branchId: this.branchId, coveredEntryId: conversationBoundary(ctx) }; }
  private covered(ctx: CompanionContext): boolean {
    const snapshot = this.snapshot, current = this.source(ctx);
    return !!snapshot && snapshot.freshness === "reviewed" && snapshot.source.harness === "pi" && snapshot.source.sessionId === current.sessionId && snapshot.source.branchId === current.branchId && snapshot.source.coveredEntryId === current.coveredEntryId;
  }
  async turnEnd(ctx: CompanionContext): Promise<void> {
    if (this.sessionId === ctx.sessionManager.getSessionId() && !this.covered(ctx)) await this.observe(() => this.publisher.markUnreviewed());
  }
  async beforeSettle(ctx: CompanionContext, event: { outcome: string; canContinue: boolean }): Promise<RefreshContinuation | undefined> {
    if (!this.ready || this.sessionId !== ctx.sessionManager.getSessionId() || this.covered(ctx)) return;
    // canContinue describes the pre-draft context (normally ending in an assistant reply).
    // Our appended custom_message supplies valid user context for exactly one continuation.
    if (event.outcome !== "completed" || this.refreshUsed) { await this.observe(() => this.publisher.markUnreviewed(true)); return; }
    this.refreshUsed = true;
    return { continue: true, entries: [{ type: "custom_message", customType: FOCUS_REFRESH_MESSAGE, display: false, content: `Refresh the Wolfpack focus panel once with ${FOCUS_TOOL} for the latest request and work, then finish. Keep semantic content honest; do not resume implementation merely to maintain the panel.${this.lastError ? ` Last publication error: ${this.lastError}` : ""}` }] };
  }
  async settled(ctx: CompanionContext, aborted: boolean): Promise<void> {
    if (this.sessionId !== ctx.sessionManager.getSessionId()) return;
    if (!this.covered(ctx)) await this.observe(() => this.publisher.markUnreviewed(true));
    await this.observe(() => this.publisher.activity(aborted ? "interrupted" : "idle"));
  }
}

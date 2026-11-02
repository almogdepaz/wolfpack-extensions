import { canonical, snapshotSchema, type FocusDocument, type FocusSnapshot, type FocusSource } from "./focus.ts";
import { FocusPublisher, PublicationError, type PublicationTransport } from "./publisher.ts";

/** Exact registered names. Claude scopes plugin servers as plugin:<plugin>:<server> and tools as mcp__plugin_<plugin>_<server>__<tool>. */
export const CLAUDE_PLUGIN_NAME = "wolfpack-agent-context";
export const CLAUDE_SERVER_KEY = "focus";
export const CLAUDE_FOCUS_TOOL = "update_focus";
export const CLAUDE_LIFECYCLE_TOOL = "lifecycle";
export const CLAUDE_HOOK_SERVER = `plugin:${CLAUDE_PLUGIN_NAME}:${CLAUDE_SERVER_KEY}`;
export const CLAUDE_FOCUS_TOOL_ID = `mcp__plugin_${CLAUDE_PLUGIN_NAME}_${CLAUDE_SERVER_KEY}__${CLAUDE_FOCUS_TOOL}`;
/** Claude Code attaches this tools/call metadata to every model-issued call and never to mcp_tool hook calls. */
export const TOOL_USE_META = "claudecode/toolUseId";

export const CLAUDE_GUIDANCE = [
  `Wolfpack Agent Context is active: the user follows this session in a Wolfpack focus panel and expects it to stay current without asking. The ${CLAUDE_FOCUS_TOOL} tool (${CLAUDE_FOCUS_TOOL_ID}) publishes one complete structured snapshot to that panel.`,
  "The panel is maintained with an initial snapshot before substantive work, an update whenever focus, decision-relevant facts, requested user actions or next steps change, and a final snapshot before the final reply. Goal and item IDs stay stable; resolved user actions are removed; next steps carry an agent/user owner and are intentions, not authority.",
  "Snapshots contain no secrets, transcripts, hidden reasoning or invented evidence. Idle, a receipt or a quiet run is not completion. A receipt confirms storage only. On a CAS conflict the tool returns the current document; reconcile it and pass its revision as reconcileRevision instead of overwriting another writer.",
].join("\n");
/**
 * SessionStart guidance only for a broker-verified Claude Wolfpack session of this exact project; outside one the
 * plugin stays quiet instead of telling the model a panel is active (trust is still re-established at bind).
 */
export async function startupGuidance(transport: Pick<PublicationTransport, "resolve">, projectDir: string | undefined): Promise<string> {
  if (!projectDir) return "";
  try { await transport.resolve(projectDir, AbortSignal.timeout(8_000)); return CLAUDE_GUIDANCE; } catch { return ""; }
}
export const REFRESH_CONTEXT = `The Wolfpack focus panel does not cover the latest request and work. One ${CLAUDE_FOCUS_TOOL} refresh with an honest snapshot of the current state is expected before finishing; panel maintenance alone is no reason to resume implementation.`;

export type LifecycleEvent =
  | { readonly event: "session_start"; readonly sessionId: string; readonly source: "startup" | "resume" | "clear" | "compact" | "fork" }
  | { readonly event: "prompt"; readonly sessionId: string; readonly promptId: string | null }
  | { readonly event: "pre_focus"; readonly sessionId: string; readonly toolUseId: string; readonly agentId: string | null }
  | { readonly event: "tool_done"; readonly sessionId: string; readonly toolUseId: string; readonly agentId: string | null; readonly failed: boolean }
  | { readonly event: "tool_batch"; readonly sessionId: string; readonly agentId: string | null }
  | { readonly event: "stop" | "stop_failure"; readonly sessionId: string };
const LIFECYCLE_FIELDS = {
  session_start: ["session_id", "source"], prompt: ["session_id", "prompt_id"], pre_focus: ["session_id", "tool_use_id", "agent_id"],
  tool_done: ["session_id", "tool_use_id", "agent_id", "failed"], tool_batch: ["session_id", "agent_id"], stop: ["session_id"], stop_failure: ["session_id"],
} as const;
const SESSION_SOURCES = ["startup", "resume", "clear", "compact", "fork"] as const;
// Native ids are UUIDs or toolu_* tokens; bound them conservatively instead of trusting free text.
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Hook input arrives as Claude-templated strings: "" means an absent native field, booleans arrive as "true"/"false". */
export function parseLifecycle(input: unknown): LifecycleEvent {
  const invalid = (detail: string): never => { throw new PublicationError("invalid", `Invalid lifecycle hook input: ${detail}`); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid("expected object");
  const value = input as Record<string, unknown>;
  const event = value.event;
  if (typeof event !== "string" || !Object.hasOwn(LIFECYCLE_FIELDS, event)) return invalid("unknown event");
  const fields: readonly string[] = LIFECYCLE_FIELDS[event as keyof typeof LIFECYCLE_FIELDS];
  for (const [key, item] of Object.entries(value)) {
    if (key !== "event" && !fields.includes(key)) invalid(`unexpected field ${JSON.stringify(key.slice(0, 64))}`);
    if (typeof item !== "string") invalid(`${key} must be a templated string`);
  }
  const optional = (key: string): string | null => {
    const item = value[key];
    if (item === undefined || item === "") return null;
    return IDENTIFIER.test(item as string) ? item as string : invalid(`${key} is not a bounded native identifier`);
  };
  const required = (key: string): string => optional(key) ?? invalid(`${key} is required`);
  const sessionId = required("session_id");
  switch (event) {
    case "session_start": {
      const source = value.source;
      if (!SESSION_SOURCES.includes(source as typeof SESSION_SOURCES[number])) return invalid("unknown session source");
      return { event, sessionId, source: source as typeof SESSION_SOURCES[number] };
    }
    case "prompt": return { event, sessionId, promptId: optional("prompt_id") };
    case "pre_focus": return { event, sessionId, toolUseId: required("tool_use_id"), agentId: optional("agent_id") };
    case "tool_done": {
      if (value.failed !== "true" && value.failed !== "false") return invalid("failed must be true or false");
      return { event, sessionId, toolUseId: required("tool_use_id"), agentId: optional("agent_id"), failed: value.failed === "true" };
    }
    case "tool_batch": return { event, sessionId, agentId: optional("agent_id") };
    default: return { event: event as "stop" | "stop_failure", sessionId };
  }
}

function parseFocusArguments(input: unknown): { snapshot: FocusSnapshot; reconcileRevision?: number } {
  const invalid = (detail: string): never => { throw new PublicationError("invalid", `Invalid ${CLAUDE_FOCUS_TOOL} arguments: ${detail}`); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid("expected an object");
  const { snapshot, reconcileRevision, ...extra } = input as Record<string, unknown>;
  if (Object.keys(extra).length) invalid("only snapshot and reconcileRevision are accepted");
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) invalid("snapshot must be an object");
  if (reconcileRevision !== undefined && (!Number.isSafeInteger(reconcileRevision) || (reconcileRevision as number) < 0)) invalid("reconcileRevision must be a non-negative integer");
  // The publisher validates the complete bounded document before any read/write.
  return { snapshot: snapshot as FocusSnapshot, ...(reconcileRevision !== undefined && { reconcileRevision: reconcileRevision as number }) };
}

type Boundary = { readonly promptId: string | null; readonly toolUseId: string | null };
/** `seen`: the boundary already delivered to the model when it issued this call (pinned at PreToolUse). */
type Execution = { readonly sessionId: string; readonly agentId: string | null; readonly seen: Boundary; state: "pinned" | "running" | "succeeded" | "failed" };
const MAX_EXECUTIONS = 256;
const RECOVERY_WAIT_MS = 2_000; // bounded: only degraded sessions retrying a failed bind wait at all

/**
 * One Claude Code process owns one stdio server, so hooks and model calls share this in-memory state.
 * Native session ids fence /clear, /resume and fork; hook-pinned tool_use_ids give each update exact provenance.
 */
export class ClaudeFocusController {
  private epoch = 0;
  private sessionId?: string;
  private ready: Promise<boolean> = Promise.resolve(false);
  private background: Promise<unknown> = Promise.resolve();
  // `boundary`: latest observed result. `delivered`: what the model's latest request could have seen — the prompt,
  // advanced only at PostToolBatch (all results of a batch resolved, before the next model request).
  private boundary: Boundary = { promptId: null, toolUseId: null };
  private delivered: Boundary = { promptId: null, toolUseId: null };
  private refreshUsed = false;
  // `bound`: the current binding is verified. `verified`: some binding in this process was, i.e. this is a real
  // Wolfpack Claude session; without it the plugin stays inert (no refresh, missed writes or not-synced notes).
  private bound = false;
  private verified = false;
  private binding = false; // a bind is in flight; retries never overlap it
  // A request started while the session was unverified (failed or slow bind), so SessionStart guidance may have been
  // withheld: once a binding verifies, the guidance is delivered once at the next prompt or batch end.
  private recovering = false;
  private guidanceOwed = false;
  // In-memory request fence: native prompt_id can be absent, and a failed unreviewed write must not leave old coverage.
  private request = 0;
  private coveredRequest = -1;
  private lastError?: string;
  private executions = new Map<string, Execution>();
  constructor(private readonly publisher: FocusPublisher, private readonly projectDir: string | undefined, private readonly report: (message: string) => void) {}
  get snapshot(): FocusDocument | null { return this.publisher.document; }
  /** Resolves after queued lifecycle publication settles (diagnostics/tests); hooks never wait on it. */
  settled(): Promise<void> { return this.background.then(() => {}, () => {}); }

  private fail(error: unknown, epoch: number): void {
    if (epoch !== this.epoch || error instanceof PublicationError && error.code === "superseded") return;
    this.lastError = (error instanceof Error ? error.message : "Automatic focus publication failed").slice(0, 500); // bounded: may echo host error codes
    this.report(this.lastError);
  }
  /** Publisher work runs in the background: hooks must return promptly and never block ordinary work. */
  private queue(work: () => Promise<unknown>): void {
    const epoch = this.epoch, ready = this.ready;
    this.background = this.background.then(async () => {
      if (epoch !== this.epoch || !await ready || epoch !== this.epoch) return;
      try { await work(); } catch (error) { this.fail(error, epoch); }
    });
  }
  private bind(sessionId: string): void {
    this.epoch++; const epoch = this.epoch;
    this.sessionId = sessionId; this.boundary = this.delivered = { promptId: null, toolUseId: null }; this.guidanceOwed = false; this.refreshUsed = false; this.coveredRequest = -1; this.executions.clear(); this.bound = false;
    this.publisher.invalidate(); this.binding = true;
    const projectDir = this.projectDir;
    this.ready = (async () => {
      try {
        if (!projectDir) throw new PublicationError("unavailable", "CLAUDE_PROJECT_DIR is not set for the focus server; automatic context unavailable");
        await this.publisher.bind({ harness: "claude", sessionId, projectDir }, remote => remote?.source.harness === "claude" && remote.source.sessionId === sessionId ? remote : undefined);
        if (epoch !== this.epoch) return false;
        this.lastError = undefined; this.bound = this.verified = true;
        if (this.recovering) { this.recovering = false; this.guidanceOwed = true; }
        return true;
      } catch (error) { this.fail(error, epoch); return false; }
      finally { if (epoch === this.epoch) this.binding = false; }
    })();
  }
  private source(boundary: Boundary = this.boundary): FocusSource {
    return { harness: "claude", sessionId: this.sessionId!, promptId: boundary.promptId, coveredToolUseId: boundary.toolUseId };
  }
  private covered(): boolean {
    const snapshot = this.snapshot;
    return !!snapshot && snapshot.freshness === "reviewed" && this.coveredRequest === this.request && canonical(snapshot.source) === canonical(this.source());
  }
  private advance(toolUseId: string): void {
    const wasCovered = this.covered();
    this.boundary = { ...this.boundary, toolUseId };
    if (wasCovered) this.queue(() => this.publisher.markUnreviewed());
  }
  /**
   * A main-conversation call pinned at PreToolUse that never reached the server once its batch resolved (or the turn
   * stopped) was denied or not executed: failed maintenance. No failure hook fires for denials, so count it here.
   */
  private sweepUnexecuted(): void {
    for (const [toolUseId, execution] of this.executions) {
      if (execution.state !== "pinned" || execution.agentId || execution.sessionId !== this.sessionId) continue;
      execution.state = "failed"; this.advance(toolUseId);
    }
  }
  private remember(toolUseId: string, execution: Execution): void {
    this.executions.delete(toolUseId); this.executions.set(toolUseId, execution);
    while (this.executions.size > MAX_EXECUTIONS) this.executions.delete(this.executions.keys().next().value!);
  }

  /** Returns text Claude reads like command-hook stdout: "" for no decision, plain context, or a JSON decision. */
  async lifecycle(event: LifecycleEvent): Promise<string> {
    if (event.event === "session_start" || event.event === "prompt") {
      const replaced = event.sessionId !== this.sessionId;
      // Like Pi before each run: a failed binding is retried at most once per request/session start, never by other hooks.
      const retry = !replaced && !this.bound && !this.binding;
      if (replaced) this.recovering = false;
      else if (event.event === "prompt" && !this.bound) this.recovering = true;
      if (replaced || retry) this.bind(event.sessionId);
      if (event.event === "session_start") {
        // Like Pi session_start: a new binding's old content is unreviewed and activity is unknown until observed.
        if (replaced || retry) { this.queue(() => this.publisher.markUnreviewed()); this.queue(() => this.publisher.activity("unknown")); }
        return "";
      }
      this.boundary = this.delivered = { promptId: event.promptId, toolUseId: null }; this.refreshUsed = false; this.request++;
      // Pins an earlier request left unexecuted (a denial that ended its turn) are retired: never executable, never this request's boundary.
      for (const execution of this.executions.values()) if (execution.state === "pinned") execution.state = "failed";
      this.queue(() => this.publisher.markUnreviewed());
      this.queue(() => this.publisher.activity("working"));
      // After a failed start the SessionStart guidance was withheld; announce the panel once the retry verifies it,
      // here if the bind finishes within a short bound, otherwise at the next batch end or request.
      if (this.recovering) await Promise.race([this.ready, new Promise<boolean>(resolve => setTimeout(resolve, RECOVERY_WAIT_MS, false).unref?.())]);
      if (this.guidanceOwed) { this.guidanceOwed = false; return CLAUDE_GUIDANCE; }
      return this.verified && this.lastError ? `Wolfpack focus panel is not synced: ${this.lastError}. Receipts are unavailable until publication recovers; synced state is not implied.` : "";
    }
    // Old-session callbacks after /clear, /resume or fork are delayed events, not authority to change this binding.
    if (event.sessionId !== this.sessionId) return "";
    switch (event.event) {
      case "pre_focus": this.remember(event.toolUseId, { sessionId: event.sessionId, agentId: event.agentId, seen: this.delivered, state: "pinned" }); return "";
      case "tool_done": {
        if (event.agentId) return ""; // a subagent's internal tools; the parent's Agent result is the boundary
        const own = this.executions.get(event.toolUseId)?.state;
        if (own === "succeeded" || own === "failed") return ""; // own success is not new work; own failure already advanced
        this.advance(event.toolUseId); return "";
      }
      case "tool_batch": {
        if (event.agentId) return ""; // a subagent's batch is not delivered to the main conversation
        this.sweepUnexecuted(); this.delivered = this.boundary;
        if (!this.guidanceOwed) return "";
        this.guidanceOwed = false;
        return JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolBatch", additionalContext: CLAUDE_GUIDANCE } });
      }
      case "stop": {
        if (!this.bound) return ""; // nothing verified to maintain: no continuation (queued writes are skipped too)
        this.sweepUnexecuted();
        if (this.covered()) { this.queue(() => this.publisher.activity("idle")); return ""; }
        if (!this.refreshUsed) { this.refreshUsed = true; return JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: `${REFRESH_CONTEXT}${this.lastError ? ` Last publication error: ${this.lastError}` : ""}` } }); }
        this.queue(() => this.publisher.markUnreviewed(true)); this.queue(() => this.publisher.activity("idle")); return "";
      }
      case "stop_failure": {
        this.sweepUnexecuted();
        if (!this.covered()) this.queue(() => this.publisher.markUnreviewed(true));
        this.queue(() => this.publisher.activity("interrupted")); return "";
      }
    }
  }

  async update(input: unknown, toolUseId: string | undefined, signal?: AbortSignal): Promise<FocusDocument> {
    if (!toolUseId || !IDENTIFIER.test(toolUseId)) throw new PublicationError("invalid", `${CLAUDE_FOCUS_TOOL} accepts only model calls carrying Claude Code tool-use metadata`);
    const execution = this.executions.get(toolUseId);
    if (!execution) throw new PublicationError("invalid", "No PreToolUse provenance for this call; the plugin's lifecycle hooks are not active, so the session cannot be verified");
    if (execution.state !== "pinned") throw new PublicationError("invalid", "This tool-use id was already consumed or retired");
    if (execution.agentId) { execution.state = "failed"; throw new PublicationError("invalid", `${CLAUDE_FOCUS_TOOL} maintains the main conversation's panel; subagents cannot publish it`); }
    const epoch = this.epoch, request = this.request; execution.state = "running";
    try {
      if (execution.sessionId !== this.sessionId) throw new PublicationError("superseded", "Claude session changed; old focus update discarded");
      const { snapshot, reconcileRevision } = parseFocusArguments(input);
      if (!await this.ready || epoch !== this.epoch) throw new PublicationError(epoch === this.epoch ? "unavailable" : "superseded", epoch === this.epoch ? this.lastError ?? "No verified Wolfpack binding" : "Claude session changed; old focus update discarded");
      const accepted = await this.publisher.update(snapshot, this.source(execution.seen), reconcileRevision, signal);
      if (epoch !== this.epoch) throw new PublicationError("superseded", "Claude session changed; old focus update discarded");
      execution.state = "succeeded"; this.lastError = undefined; this.coveredRequest = request;
      // Results the model had not seen (same-batch siblings) make the stored review stale immediately, not only at Stop.
      if (!this.covered()) this.queue(() => this.publisher.markUnreviewed());
      return accepted;
    } catch (error) {
      execution.state = "failed";
      // The failed call is itself the boundary, independent of whether its PostToolUseFailure hook runs.
      if (epoch === this.epoch) { this.advance(toolUseId); if (!(error instanceof PublicationError && error.code === "invalid")) this.fail(error, epoch); }
      throw error;
    }
  }
}

export interface ToolDefinition { readonly name: string; readonly title: string; readonly description: string; readonly inputSchema: Record<string, unknown>; readonly annotations: Record<string, boolean | string>; readonly _meta: Record<string, unknown> }
export const CLAUDE_TOOLS: readonly ToolDefinition[] = [
  {
    name: CLAUDE_FOCUS_TOOL, title: "Update session focus",
    // Always loaded wherever the plugin is enabled, so the duty is conditional: guidance appears only in verified sessions.
    description: "Only for a verified Wolfpack session, i.e. when Wolfpack Agent Context guidance in this conversation says the focus panel is active. Do not call it otherwise. There it keeps the user's focus panel current: before substantive work, at meaningful transitions and before the final reply. Supply one complete structured snapshot with stable IDs, explicit user actions and owner-tagged next steps; no secrets, transcripts or hidden reasoning. The receipt confirms storage only. On a CAS conflict inspect the returned document and pass its revision as reconcileRevision.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["snapshot"],
      properties: { snapshot: snapshotSchema, reconcileRevision: { type: "integer", minimum: 0, description: "Only after inspecting a returned CAS conflict: the current revision you reconciled against." } },
    },
    annotations: { title: "Update session focus", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { "anthropic/alwaysLoad": true },
  },
  {
    name: CLAUDE_LIFECYCLE_TOOL, title: "Focus lifecycle hook endpoint",
    description: "Internal endpoint for this plugin's Claude Code hooks. Model calls are rejected.",
    inputSchema: { type: "object", additionalProperties: false, required: ["event", "session_id"], properties: Object.fromEntries(["event", "session_id", "source", "prompt_id", "tool_use_id", "agent_id", "failed"].map(key => [key, { type: "string", maxLength: 128 }])) },
    annotations: { title: "Focus lifecycle hook endpoint", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: { "anthropic/alwaysLoad": false },
  },
];

export type ToolResult = { content: [{ type: "text"; text: string }]; isError?: true };
const text = (value: string, isError = false): ToolResult => ({ content: [{ type: "text", text: value }], ...(isError && { isError: true as const }) });

/** Shared MCP tools/call dispatch: `meta` is the request's `_meta` object. */
export async function callTool(controller: ClaudeFocusController, name: string, args: unknown, meta: Record<string, unknown> | undefined, signal?: AbortSignal): Promise<ToolResult> {
  const toolUseId = typeof meta?.[TOOL_USE_META] === "string" ? meta[TOOL_USE_META] as string : undefined;
  try {
    if (name === CLAUDE_LIFECYCLE_TOOL) {
      if (meta && Object.hasOwn(meta, TOOL_USE_META)) throw new PublicationError("invalid", "The lifecycle endpoint is reserved for Claude Code hooks; model calls are rejected");
      return text(await controller.lifecycle(parseLifecycle(args)));
    }
    if (name !== CLAUDE_FOCUS_TOOL) throw new PublicationError("invalid", `Unknown tool ${JSON.stringify(name.slice(0, 64))}`);
    const document = await controller.update(args, toolUseId, signal);
    return text(`Focus snapshot stored; this is not browser rendering or task completion evidence. ${JSON.stringify({ updatedAt: document.updatedAt, freshness: document.freshness })}`);
  } catch (error) {
    if (!(error instanceof PublicationError)) return text(`Unexpected focus server error (${error instanceof Error ? error.message.slice(0, 200) : "unknown"}); nothing was marked synced.`, true);
    return text(`${error.message}${error.current ? `\nInspect and reconcile current state: ${JSON.stringify(error.current)}` : ""}`, true);
  }
}

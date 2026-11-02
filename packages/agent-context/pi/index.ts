import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CliTransport } from "../src/cli.ts";
import { FOCUS_TOOL, FocusCompanion } from "../src/companion.ts";
import { snapshotSchema, type FocusSnapshot } from "../src/focus.ts";
import { FocusPublisher, PublicationError } from "../src/publisher.ts";

/** Pi 1.4.0+ companion. No terminal widget, observer model, timers or live-presence claim. */
export default function agentContext(pi: ExtensionAPI): void {
  const version = /^(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(VERSION);
  if (!version || Number(version[1]) < 1 || Number(version[1]) === 1 && Number(version[2]) < 4) throw new Error("Agent Context requires Pi >=1.4.0 with agent_before_settle/agent_settled lifecycle support");
  const companion = new FocusCompanion(new FocusPublisher(new CliTransport("pi")), (type, data) => pi.appendEntry(type, data), message => {
    // Lifecycle diagnostics must not enqueue model messages: repeated transport failures must never drive a continuation loop.
    console.error(`[agent-context] Focus panel not synced: ${message}`);
  });
  pi.registerTool({
    name: FOCUS_TOOL, label: "Update session focus", exposure: "model-only", executionMode: "sequential",
    description: "Maintain the Wolfpack focus panel automatically before work, at meaningful transitions and before finishing. Supply one complete structured snapshot. Stable IDs; explicit user actions and next-step owners; no secrets/transcripts/hidden reasoning. Receipt confirms storage only. On conflict inspect current state and explicitly reconcile using reconcileRevision.",
    parameters: Type.Object({
      snapshot: Type.Unsafe<FocusSnapshot>(snapshotSchema),
      reconcileRevision: Type.Optional(Type.Integer({ minimum: 0, description: "Only after inspecting a returned CAS conflict: the current revision you reconciled against." })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) throw new PublicationError("superseded", "Focus tool was cancelled");
      try {
        const document = await companion.update(ctx, params.snapshot, params.reconcileRevision, signal);
        return { content: [{ type: "text", text: "Focus snapshot stored; this is not browser rendering or task completion evidence." }], details: { document } };
      } catch (error) {
        if (!(error instanceof PublicationError)) throw error;
        return { isError: true, content: [{ type: "text", text: `${error.message}${error.current ? `\nInspect and reconcile current state: ${JSON.stringify(error.current)}` : ""}` }], details: { code: error.code, current: error.current } };
      }
    },
  });
  pi.on("session_start", async (_event, ctx) => companion.start(ctx));
  const invalidate = () => { companion.invalidate(); };
  pi.on("session_before_switch", invalidate);
  pi.on("session_before_fork", invalidate);
  pi.on("session_before_tree", invalidate);
  pi.on("session_shutdown", invalidate);
  pi.on("session_tree", async (_event, ctx) => companion.start(ctx));
  pi.on("before_agent_start", async (event, ctx) => { event.systemPromptOptions.sections.agent_context = await companion.beforeRun(ctx); });
  pi.on("agent_start", async (_event, ctx) => companion.working(ctx));
  pi.on("turn_end", async (_event, ctx) => companion.turnEnd(ctx));
  pi.on("agent_before_settle", async (event, ctx) => companion.beforeSettle(ctx, { outcome: event.outcome, canContinue: event.context.canContinue }));
  pi.on("agent_settled", async (event, ctx) => companion.settled(ctx, event.aborted));
}

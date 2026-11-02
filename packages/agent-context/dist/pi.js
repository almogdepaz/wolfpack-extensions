// pi/index.ts
import { VERSION } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// src/cli.ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// schemas/context.schema.json
var context_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "goal",
    "now",
    "needsYou",
    "needToKnow",
    "nextSteps",
    "history",
    "source",
    "updatedAt",
    "freshness",
    "activity"
  ],
  properties: {
    schemaVersion: {
      const: 3
    },
    goal: {
      type: "string",
      minLength: 1,
      maxLength: 1000
    },
    now: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "text"
      ],
      properties: {
        id: {
          type: "string",
          minLength: 1,
          maxLength: 128
        },
        text: {
          type: "string",
          minLength: 1,
          maxLength: 240
        },
        details: {
          type: "string",
          minLength: 1,
          maxLength: 2000
        }
      }
    },
    needsYou: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },
          details: {
            type: "string",
            minLength: 1,
            maxLength: 2000
          }
        }
      }
    },
    needToKnow: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },
          details: {
            type: "string",
            minLength: 1,
            maxLength: 2000
          }
        }
      }
    },
    nextSteps: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text",
          "owner"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },
          details: {
            type: "string",
            minLength: 1,
            maxLength: 2000
          },
          owner: {
            enum: [
              "agent",
              "user"
            ]
          }
        }
      }
    },
    history: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text",
          "kind"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },
          details: {
            type: "string",
            minLength: 1,
            maxLength: 2000
          },
          kind: {
            enum: [
              "decision",
              "completed"
            ]
          }
        }
      }
    },
    source: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "harness",
            "sessionId",
            "branchId",
            "coveredEntryId"
          ],
          properties: {
            harness: {
              const: "pi"
            },
            sessionId: {
              type: "string",
              minLength: 1,
              maxLength: 128
            },
            branchId: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            },
            coveredEntryId: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "harness",
            "sessionId",
            "promptId",
            "coveredToolUseId"
          ],
          properties: {
            harness: {
              const: "claude"
            },
            sessionId: {
              type: "string",
              minLength: 1,
              maxLength: 128
            },
            promptId: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            },
            coveredToolUseId: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            }
          }
        }
      ]
    },
    updatedAt: {
      type: "string",
      minLength: 24,
      maxLength: 24
    },
    freshness: {
      enum: [
        "reviewed",
        "unreviewed",
        "missed"
      ]
    },
    activity: {
      type: "object",
      additionalProperties: false,
      required: [
        "state",
        "observedAt"
      ],
      properties: {
        state: {
          enum: [
            "working",
            "idle",
            "interrupted",
            "unknown"
          ]
        },
        observedAt: {
          type: "string",
          minLength: 24,
          maxLength: 24
        }
      }
    }
  }
};

// src/focus.ts
var CONTEXT_SCHEMA_VERSION = 3;
var MAX_DOCUMENT_BYTES = 64 * 1024;
function matches(value, rule) {
  if (rule.oneOf && rule.oneOf.filter((branch) => matches(value, branch)).length !== 1)
    return false;
  if ("const" in rule && value !== rule.const || rule.enum && !rule.enum.includes(value))
    return false;
  if (rule.type) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (!types.includes(type))
      return false;
  }
  if (typeof value === "string" && ([...value].length < (rule.minLength ?? 0) || [...value].length > (rule.maxLength ?? Infinity)))
    return false;
  if (Array.isArray(value) && (value.length > (rule.maxItems ?? Infinity) || rule.items && !value.every((item) => matches(item, rule.items))))
    return false;
  if (rule.properties && value && typeof value === "object" && !Array.isArray(value)) {
    const object = value;
    if (rule.required?.some((key) => !Object.hasOwn(object, key)) || Object.keys(object).some((key) => {
      const property = rule.properties[key];
      return !Object.hasOwn(rule.properties, key) || !property || !matches(object[key], property);
    }))
      return false;
  }
  return true;
}
var timestamp = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};
function isFocusDocument(value) {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_DOCUMENT_BYTES || !matches(value, context_schema_default))
      return false;
    const document = value;
    return timestamp(document.updatedAt) && timestamp(document.activity.observedAt) && [document.needsYou, document.needToKnow, document.nextSteps, document.history].every((items) => new Set(items.map((item) => item.id)).size === items.length);
  } catch {
    return false;
  }
}
function snapshotOf(document) {
  return { goal: document.goal, now: document.now, needsYou: document.needsYou, needToKnow: document.needToKnow, nextSteps: document.nextSteps, history: document.history };
}
function canonical(value) {
  if (Array.isArray(value))
    return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
var snapshotSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "now", "needsYou", "needToKnow", "nextSteps", "history"],
  properties: Object.fromEntries(["goal", "now", "needsYou", "needToKnow", "nextSteps", "history"].map((key) => [key, context_schema_default.properties[key]]))
};

// src/publisher.ts
import { randomUUID } from "node:crypto";
class PublicationError extends Error {
  code;
  current;
  constructor(code, message, current) {
    super(message);
    this.code = code;
    this.current = current;
  }
}

class FocusPublisher {
  transport;
  now;
  accepted = null;
  remote = null;
  observed;
  epoch = 0;
  abort = new AbortController;
  scope;
  binding;
  revision = 0;
  queue = Promise.resolve();
  pending;
  get document() {
    return this.accepted;
  }
  constructor(transport, now = () => new Date().toISOString()) {
    this.transport = transport;
    this.now = now;
  }
  invalidate() {
    this.epoch++;
    this.abort.abort();
    this.abort = new AbortController;
    this.scope = this.binding = undefined;
    this.accepted = this.remote = null;
    this.pending = undefined;
    this.observed = undefined;
    this.queue = Promise.resolve();
  }
  check(epoch, signal = this.abort.signal) {
    if (epoch !== this.epoch || signal.aborted)
      throw new PublicationError("superseded", "Session/branch binding changed; old publication discarded");
  }
  sameProducer(source, binding) {
    return source.harness === binding.harness && source.sessionId === binding.sessionId;
  }
  async bind(binding, restore) {
    this.invalidate();
    const epoch = this.epoch;
    const signal = this.abort.signal;
    const scope = await this.transport.resolve(binding.projectDir, signal);
    this.check(epoch, signal);
    if (scope.projectDir !== binding.projectDir)
      throw new PublicationError("invalid", "Verified project does not match Pi working directory");
    const current = await this.transport.read(scope, signal);
    this.check(epoch, signal);
    const restored = restore?.(current.document);
    if (restored && (!isFocusDocument(restored) || !this.sameProducer(restored.source, binding)))
      throw new PublicationError("invalid", "Restored focus provenance does not match the bound producer session");
    this.scope = scope;
    this.binding = binding;
    this.revision = current.revision;
    this.remote = current.document;
    this.accepted = restored ? { ...restored, freshness: "unreviewed" } : null;
  }
  serialize(work, operationSignal) {
    const epoch = this.epoch;
    const signal = operationSignal ? AbortSignal.any([this.abort.signal, operationSignal]) : this.abort.signal;
    const result = this.queue.then(async () => {
      this.check(epoch, signal);
      if (!this.scope || !this.binding)
        throw new PublicationError("unavailable", "No verified Wolfpack session; automatic context unavailable");
      return work(epoch, signal);
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async flush(epoch, signal) {
    const operation = this.pending;
    if (!operation)
      return;
    for (let attempt = 0;attempt < 2; attempt++) {
      this.check(epoch, signal);
      try {
        const receipt = await this.transport.publish(this.scope, operation.document, operation.baseRevision, operation.requestId, signal);
        this.check(epoch, signal);
        if (receipt.revision !== operation.baseRevision + 1)
          throw new PublicationError("invalid", "Publication receipt revision mismatch");
        this.revision = receipt.revision;
        this.remote = operation.document;
        if (operation.semantic || this.accepted && canonical(snapshotOf(this.accepted)) === canonical(snapshotOf(operation.document)) && canonical(this.accepted.source) === canonical(operation.document.source))
          this.accepted = operation.document;
        this.pending = undefined;
        return;
      } catch (error) {
        this.check(epoch, signal);
        if (error instanceof PublicationError && error.code === "conflict") {
          const current = await this.transport.read(this.scope, signal);
          this.check(epoch, signal);
          this.pending = undefined;
          throw new PublicationError("conflict", "Read current context and reconcile explicitly using reconcileRevision before replacing another writer", current);
        }
        if (!(error instanceof PublicationError) || error.code !== "ambiguous") {
          this.pending = undefined;
          throw error;
        }
        if (attempt === 1)
          throw error;
      }
    }
  }
  async store(document, epoch, signal, reconcileRevision, semantic = true) {
    await this.flush(epoch, signal);
    this.check(epoch, signal);
    const current = await this.transport.read(this.scope, signal);
    this.check(epoch, signal);
    if (current.revision !== this.revision && reconcileRevision !== current.revision)
      throw new PublicationError("conflict", "Context changed; inspect current document and explicitly reconcile", current);
    if (canonical(current.document) === canonical(document)) {
      if (semantic)
        this.accepted = document;
      this.remote = document;
      this.revision = current.revision;
      return;
    }
    this.pending = { document, baseRevision: current.revision, requestId: randomUUID(), semantic };
    await this.flush(epoch, signal);
  }
  update(snapshot, source, reconcileRevision, operationSignal) {
    const copy = structuredClone(snapshot);
    const pinned = structuredClone(source);
    return this.serialize(async (epoch, signal) => {
      if (!this.sameProducer(pinned, this.binding))
        throw new PublicationError("invalid", "Focus producer harness/session does not match the verified binding");
      await this.flush(epoch, signal);
      this.check(epoch, signal);
      const previous = this.accepted;
      if (reconcileRevision === undefined && previous && previous.freshness === "reviewed" && canonical(previous.source) === canonical(pinned) && canonical(snapshotOf(previous)) === canonical(copy) && canonical(previous) === canonical(this.remote)) {
        const current = await this.transport.read(this.scope, signal);
        this.check(epoch, signal);
        if (current.revision !== this.revision || canonical(current.document) !== canonical(this.remote))
          throw new PublicationError("conflict", "Context changed; inspect current document and explicitly reconcile", current);
        return previous;
      }
      const document = {
        ...copy,
        schemaVersion: CONTEXT_SCHEMA_VERSION,
        source: pinned,
        updatedAt: this.now(),
        freshness: "reviewed",
        activity: this.observed ?? { state: "unknown", observedAt: this.now() }
      };
      if (!isFocusDocument(document))
        throw new PublicationError("invalid", "Invalid bounded focus snapshot: use unique stable IDs, explicit owners and schema v3 limits");
      await this.store(document, epoch, signal, reconcileRevision);
      return this.accepted;
    }, operationSignal);
  }
  activity(state) {
    return this.serialize(async (epoch, signal) => {
      await this.flush(epoch, signal);
      this.observed = { state, observedAt: this.now() };
      if (this.remote)
        await this.store({ ...this.remote, activity: this.observed }, epoch, signal, undefined, false);
    });
  }
  markUnreviewed(missed = false) {
    return this.serialize(async (epoch, signal) => {
      await this.flush(epoch, signal);
      if (this.remote)
        await this.store({ ...this.remote, freshness: missed ? "missed" : "unreviewed" }, epoch, signal, undefined, false);
    });
  }
}

// src/cli.ts
var TARGET = "agent-context/context";
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
var command = (args, signal) => new Promise((resolve, reject) => {
  execFile("wolfpack", args, { signal, timeout: 15000, maxBuffer: 256 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
    if (signal.aborted) {
      reject(new PublicationError("superseded", "Publication cancelled with old binding"));
      return;
    }
    resolve({ stdout, stderr, exitCode: error ? typeof error.code === "number" ? error.code : 1 : 0 });
  });
});
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PublicationError("invalid", "Invalid structured CLI response");
  return value;
}
function scopeFields(value, scope) {
  return value.scopeSessionId === scope.sessionId && value.extensionId === "agent-context" && value.documentId === "context";
}

class CliTransport {
  harness;
  run;
  installations = new WeakMap;
  constructor(harness, run = command) {
    this.harness = harness;
    this.run = run;
  }
  async json(args, signal, publishing = false) {
    const result = await this.run(args, signal);
    let body;
    try {
      body = object(JSON.parse(result.stdout));
    } catch {
      throw new PublicationError(publishing ? "ambiguous" : "unavailable", "Wolfpack CLI returned no valid receipt; check CLI/host availability");
    }
    if (result.exitCode !== 0 || body.ok === false) {
      const error = body.error && typeof body.error === "object" ? object(body.error) : {};
      if (error.code === "CONFLICT")
        throw new PublicationError("conflict", "Host CAS conflict; read and reconcile");
      throw new PublicationError("unavailable", `Wolfpack CLI rejected publication/identity (${typeof error.code === "string" ? error.code : "unknown error"})`);
    }
    return body;
  }
  async resolve(projectDir, signal) {
    const body = await this.json(["session", "current-context", "--json"], signal);
    if (body.ok !== true || body.verified !== true || typeof body.sessionId !== "string" || !UUID.test(body.sessionId) || body.projectDir !== projectDir || body.harness !== this.harness)
      throw new PublicationError("invalid", `Expected exact verified ${this.harness} Wolfpack session and project; no name/environment fallback`);
    return { sessionId: body.sessionId, projectDir };
  }
  async verify(scope, signal) {
    const identity = await this.resolve(scope.projectDir, signal);
    if (identity.sessionId !== scope.sessionId)
      throw new PublicationError("superseded", "Verified Wolfpack session changed during publication");
  }
  async read(scope, signal) {
    await this.verify(scope, signal);
    const body = await this.json(["extension-data", "read", TARGET, "--session", scope.sessionId, "--json"], signal);
    const installation = this.installations.get(scope);
    if (!scopeFields(body, scope) || typeof body.installationId !== "string" || !UUID.test(body.installationId) || installation && installation !== body.installationId || !Number.isSafeInteger(body.revision) || body.revision < 0 || body.document !== null && !isFocusDocument(body.document))
      throw new PublicationError("invalid", `Context read identity/schema mismatch; schema v${CONTEXT_SCHEMA_VERSION} requires clean reinstall, never reinterpret older documents`);
    if (body.revision === 0 !== (body.document === null))
      throw new PublicationError("invalid", "Invalid document/revision pair");
    this.installations.set(scope, body.installationId);
    return { revision: body.revision, document: body.document };
  }
  async publish(scope, document, baseRevision, requestId, signal) {
    await this.verify(scope, signal);
    if (!isFocusDocument(document) || !UUID.test(requestId) || !Number.isSafeInteger(baseRevision) || baseRevision < 0)
      throw new PublicationError("invalid", "Invalid bounded focus publication operation");
    const directory = await mkdtemp(join(tmpdir(), "wolfpack-focus-"));
    try {
      const file = join(directory, "context.json");
      await writeFile(file, JSON.stringify(document), { mode: 384 });
      const body = await this.json(["extension-data", "publish", TARGET, "--session", scope.sessionId, "--file", file, "--if-revision", String(baseRevision), "--request-id", requestId, "--json"], signal, true);
      if (!body.receipt || typeof body.receipt !== "object" || Array.isArray(body.receipt))
        throw new PublicationError("ambiguous", "Publication response has no valid receipt; retry only the identical operation");
      const receipt = object(body.receipt);
      if (!scopeFields(receipt, scope) || receipt.requestId !== requestId || receipt.baseRevision !== baseRevision || receipt.revision !== baseRevision + 1 || receipt.schemaVersion !== CONTEXT_SCHEMA_VERSION || receipt.payloadDigest !== createHash("sha256").update(canonical(document)).digest("hex") || typeof receipt.acceptedAt !== "string" || !Number.isFinite(Date.parse(receipt.acceptedAt)))
        throw new PublicationError("ambiguous", "Publication receipt does not match the pinned operation; not marked synced");
      return { revision: receipt.revision };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

// src/companion.ts
var FOCUS_STATE_ENTRY = "wolfpack-agent-context-state-v3";
var FOCUS_REFRESH_MESSAGE = "wolfpack-agent-context-refresh";
var FOCUS_TOOL = "update_focus";
function conversationBoundary(ctx) {
  let boundary = null;
  for (const entry of ctx.sessionManager.getBranch())
    if (entry.type === "message" && (entry.message?.role === "user" || entry.message?.role === "toolResult" && (entry.message.toolName !== FOCUS_TOOL || entry.message.isError === true)))
      boundary = entry.id;
  return boundary;
}

class FocusCompanion {
  publisher;
  append;
  report;
  epoch = 0;
  sessionId;
  branchId = null;
  ready = false;
  refreshUsed = false;
  lastError;
  constructor(publisher, append, report) {
    this.publisher = publisher;
    this.append = append;
    this.report = report;
  }
  get snapshot() {
    return this.publisher.document;
  }
  invalidate() {
    this.epoch++;
    this.ready = false;
    this.sessionId = undefined;
    this.publisher.invalidate();
  }
  check(ctx, epoch) {
    if (epoch !== this.epoch || ctx.sessionManager.getSessionId() !== this.sessionId)
      throw new PublicationError("superseded", "Old Pi session/branch callback discarded");
  }
  fail(error) {
    this.lastError = error instanceof Error ? error.message : "Automatic focus publication failed";
    this.report(this.lastError);
  }
  async start(ctx) {
    this.invalidate();
    const epoch = this.epoch;
    const sessionId = this.sessionId = ctx.sessionManager.getSessionId();
    this.refreshUsed = false;
    const branchId = this.branchId = ctx.sessionManager.getLeafId();
    let restored;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === FOCUS_STATE_ENTRY && isFocusDocument(entry.data) && entry.data.source.harness === "pi")
        restored = entry.data;
    }
    try {
      await this.publisher.bind({ harness: "pi", sessionId, projectDir: ctx.cwd }, () => restored && { ...restored, source: { ...restored.source, sessionId, branchId } });
      this.check(ctx, epoch);
      this.ready = true;
      this.lastError = undefined;
      await this.publisher.markUnreviewed();
      this.check(ctx, epoch);
      await this.publisher.activity("unknown");
      this.check(ctx, epoch);
    } catch (error) {
      if (epoch === this.epoch)
        this.fail(error);
    }
  }
  async beforeRun(ctx) {
    let epoch = this.epoch;
    if (!this.ready || this.sessionId !== ctx.sessionManager.getSessionId()) {
      const starting = this.start(ctx);
      epoch = this.epoch;
      await starting;
    }
    this.check(ctx, epoch);
    this.refreshUsed = false;
    await this.observe(() => this.publisher.markUnreviewed());
    this.check(ctx, epoch);
    return [
      `Maintain this session's Wolfpack focus panel automatically with ${FOCUS_TOOL}; no separate user request is needed.`,
      "Publish before substantive work, at meaningful changes and before your final reply. Keep goal/IDs stable. Report now/rationale, explicit user actions (clear resolved ones), critical facts, up to three owner-tagged next steps, and bounded decisions/completed history.",
      "No secrets, transcripts, hidden reasoning, invented evidence or completion inferred from idle/publication. Next steps are intentions, not authority. On conflict inspect current state, reconcile and supply reconcileRevision; never blindly replace another writer.",
      this.lastError ? `Automatic publication unavailable: ${this.lastError}. Explain the limitation; do not claim synced.` : "Publication receipts confirm storage, not browser rendering or completed work."
    ].join(`
`);
  }
  async update(ctx, snapshot, reconcileRevision, signal) {
    const epoch = this.epoch;
    this.check(ctx, epoch);
    if (!this.ready)
      throw new PublicationError("unavailable", this.lastError ?? "No verified focus binding");
    const accepted = await this.publisher.update(snapshot, this.source(ctx), reconcileRevision, signal);
    this.check(ctx, epoch);
    this.append(FOCUS_STATE_ENTRY, accepted);
    this.lastError = undefined;
    return accepted;
  }
  async observe(work) {
    if (!this.ready)
      return;
    const epoch = this.epoch;
    try {
      await work();
    } catch (error) {
      if (epoch === this.epoch)
        this.fail(error);
    }
  }
  async working(ctx) {
    if (this.sessionId === ctx.sessionManager.getSessionId())
      await this.observe(() => this.publisher.activity("working"));
  }
  source(ctx) {
    return { harness: "pi", sessionId: this.sessionId, branchId: this.branchId, coveredEntryId: conversationBoundary(ctx) };
  }
  covered(ctx) {
    const snapshot = this.snapshot, current = this.source(ctx);
    return !!snapshot && snapshot.freshness === "reviewed" && snapshot.source.harness === "pi" && snapshot.source.sessionId === current.sessionId && snapshot.source.branchId === current.branchId && snapshot.source.coveredEntryId === current.coveredEntryId;
  }
  async turnEnd(ctx) {
    if (this.sessionId === ctx.sessionManager.getSessionId() && !this.covered(ctx))
      await this.observe(() => this.publisher.markUnreviewed());
  }
  async beforeSettle(ctx, event) {
    if (!this.ready || this.sessionId !== ctx.sessionManager.getSessionId() || this.covered(ctx))
      return;
    if (event.outcome !== "completed" || this.refreshUsed) {
      await this.observe(() => this.publisher.markUnreviewed(true));
      return;
    }
    this.refreshUsed = true;
    return { continue: true, entries: [{ type: "custom_message", customType: FOCUS_REFRESH_MESSAGE, display: false, content: `Refresh the Wolfpack focus panel once with ${FOCUS_TOOL} for the latest request and work, then finish. Keep semantic content honest; do not resume implementation merely to maintain the panel.${this.lastError ? ` Last publication error: ${this.lastError}` : ""}` }] };
  }
  async settled(ctx, aborted) {
    if (this.sessionId !== ctx.sessionManager.getSessionId())
      return;
    if (!this.covered(ctx))
      await this.observe(() => this.publisher.markUnreviewed(true));
    await this.observe(() => this.publisher.activity(aborted ? "interrupted" : "idle"));
  }
}

// pi/index.ts
function agentContext(pi) {
  const version = /^(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(VERSION);
  if (!version || Number(version[1]) < 1 || Number(version[1]) === 1 && Number(version[2]) < 4)
    throw new Error("Agent Context requires Pi >=1.4.0 with agent_before_settle/agent_settled lifecycle support");
  const companion = new FocusCompanion(new FocusPublisher(new CliTransport("pi")), (type, data) => pi.appendEntry(type, data), (message) => {
    console.error(`[agent-context] Focus panel not synced: ${message}`);
  });
  pi.registerTool({
    name: FOCUS_TOOL,
    label: "Update session focus",
    exposure: "model-only",
    executionMode: "sequential",
    description: "Maintain the Wolfpack focus panel automatically before work, at meaningful transitions and before finishing. Supply one complete structured snapshot. Stable IDs; explicit user actions and next-step owners; no secrets/transcripts/hidden reasoning. Receipt confirms storage only. On conflict inspect current state and explicitly reconcile using reconcileRevision.",
    parameters: Type.Object({
      snapshot: Type.Unsafe(snapshotSchema),
      reconcileRevision: Type.Optional(Type.Integer({ minimum: 0, description: "Only after inspecting a returned CAS conflict: the current revision you reconciled against." }))
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      if (signal?.aborted)
        throw new PublicationError("superseded", "Focus tool was cancelled");
      try {
        const document = await companion.update(ctx, params.snapshot, params.reconcileRevision, signal);
        return { content: [{ type: "text", text: "Focus snapshot stored; this is not browser rendering or task completion evidence." }], details: { document } };
      } catch (error) {
        if (!(error instanceof PublicationError))
          throw error;
        return { isError: true, content: [{ type: "text", text: `${error.message}${error.current ? `
Inspect and reconcile current state: ${JSON.stringify(error.current)}` : ""}` }], details: { code: error.code, current: error.current } };
      }
    }
  });
  pi.on("session_start", async (_event, ctx) => companion.start(ctx));
  const invalidate = () => {
    companion.invalidate();
  };
  pi.on("session_before_switch", invalidate);
  pi.on("session_before_fork", invalidate);
  pi.on("session_before_tree", invalidate);
  pi.on("session_shutdown", invalidate);
  pi.on("session_tree", async (_event, ctx) => companion.start(ctx));
  pi.on("before_agent_start", async (event, ctx) => {
    event.systemPromptOptions.sections.agent_context = await companion.beforeRun(ctx);
  });
  pi.on("agent_start", async (_event, ctx) => companion.working(ctx));
  pi.on("turn_end", async (_event, ctx) => companion.turnEnd(ctx));
  pi.on("agent_before_settle", async (event, ctx) => companion.beforeSettle(ctx, { outcome: event.outcome, canContinue: event.context.canContinue }));
  pi.on("agent_settled", async (event, ctx) => companion.settled(ctx, event.aborted));
}
export {
  agentContext as default
};

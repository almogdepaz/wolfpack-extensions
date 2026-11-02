import { randomUUID } from "node:crypto";
import { CONTEXT_SCHEMA_VERSION, canonical, isFocusDocument, snapshotOf, type FocusDocument, type FocusHarness, type FocusSnapshot, type FocusSource } from "./focus.ts";
export interface VerifiedScope { readonly sessionId: string; readonly projectDir: string }
export interface DocumentRead { readonly revision: number; readonly document: FocusDocument | null }
export interface PublicationTransport {
  resolve(projectDir: string, signal: AbortSignal): Promise<VerifiedScope>;
  read(scope: VerifiedScope, signal: AbortSignal): Promise<DocumentRead>;
  publish(scope: VerifiedScope, document: FocusDocument, baseRevision: number, requestId: string, signal: AbortSignal): Promise<{ revision: number }>;
}
export class PublicationError extends Error {
  constructor(readonly code: "conflict" | "ambiguous" | "superseded" | "unavailable" | "invalid", message: string, readonly current?: DocumentRead) { super(message); }
}
/** Exact producer identity pinned for this binding; adapters supply the native boundary per update. */
export interface Binding { readonly harness: FocusHarness; readonly sessionId: string; readonly projectDir: string }
export class FocusPublisher {
  private accepted: FocusDocument | null = null;
  private remote: FocusDocument | null = null;
  private observed?: FocusDocument["activity"];
  private epoch = 0;
  private abort = new AbortController();
  private scope?: VerifiedScope;
  private binding?: Binding;
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private pending?: { document: FocusDocument; baseRevision: number; requestId: string; semantic: boolean };
  get document(): FocusDocument | null { return this.accepted; }
  constructor(private readonly transport: PublicationTransport, private readonly now: () => string = () => new Date().toISOString()) {}
  invalidate(): void {
    this.epoch++; this.abort.abort(); this.abort = new AbortController();
    this.scope = this.binding = undefined; this.accepted = this.remote = null; this.pending = undefined; this.observed = undefined;
    this.queue = Promise.resolve();
  }
  private check(epoch: number, signal = this.abort.signal): void {
    if (epoch !== this.epoch || signal.aborted) throw new PublicationError("superseded", "Session/branch binding changed; old publication discarded");
  }
  private sameProducer(source: FocusSource, binding: Binding): boolean { return source.harness === binding.harness && source.sessionId === binding.sessionId; }
  /** `restore` receives the remote CAS baseline as evidence; only the adapter may adopt matching branch/session semantics. */
  async bind(binding: Binding, restore?: (remote: FocusDocument | null) => FocusDocument | undefined): Promise<void> {
    this.invalidate(); const epoch = this.epoch; const signal = this.abort.signal;
    const scope = await this.transport.resolve(binding.projectDir, signal); this.check(epoch, signal);
    if (scope.projectDir !== binding.projectDir) throw new PublicationError("invalid", "Verified project does not match Pi working directory");
    const current = await this.transport.read(scope, signal); this.check(epoch, signal);
    const restored = restore?.(current.document);
    if (restored && (!isFocusDocument(restored) || !this.sameProducer(restored.source, binding))) throw new PublicationError("invalid", "Restored focus provenance does not match the bound producer session");
    this.scope = scope; this.binding = binding; this.revision = current.revision; this.remote = current.document;
    // Remote documents are a CAS baseline, not semantic state unless the adapter proves the same producer.
    this.accepted = restored ? { ...restored, freshness: "unreviewed" } : null;
  }
  private serialize<T>(work: (epoch: number, signal: AbortSignal) => Promise<T>, operationSignal?: AbortSignal): Promise<T> {
    const epoch = this.epoch; const signal = operationSignal ? AbortSignal.any([this.abort.signal, operationSignal]) : this.abort.signal;
    const result = this.queue.then(async () => {
      this.check(epoch, signal);
      if (!this.scope || !this.binding) throw new PublicationError("unavailable", "No verified Wolfpack session; automatic context unavailable");
      return work(epoch, signal);
    });
    this.queue = result.catch(() => {}); // Release the mutation queue; each caller still receives its rejection.
    return result;
  }
  private async flush(epoch: number, signal: AbortSignal): Promise<void> {
    const operation = this.pending; if (!operation) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      this.check(epoch, signal);
      try {
        const receipt = await this.transport.publish(this.scope!, operation.document, operation.baseRevision, operation.requestId, signal); this.check(epoch, signal);
        if (receipt.revision !== operation.baseRevision + 1) throw new PublicationError("invalid", "Publication receipt revision mismatch");
        this.revision = receipt.revision; this.remote = operation.document;
        if (operation.semantic || this.accepted && canonical(snapshotOf(this.accepted)) === canonical(snapshotOf(operation.document)) && canonical(this.accepted.source) === canonical(operation.document.source)) this.accepted = operation.document;
        this.pending = undefined; return;
      } catch (error) {
        this.check(epoch, signal);
        if (error instanceof PublicationError && error.code === "conflict") {
          const current = await this.transport.read(this.scope!, signal); this.check(epoch, signal); this.pending = undefined;
          throw new PublicationError("conflict", "Read current context and reconcile explicitly using reconcileRevision before replacing another writer", current);
        }
        if (!(error instanceof PublicationError) || error.code !== "ambiguous") { this.pending = undefined; throw error; }
        if (attempt === 1) throw error; // Retain the exact unresolved operation for the next call, never mark it synced.
      }
    }
  }
  private async store(document: FocusDocument, epoch: number, signal: AbortSignal, reconcileRevision?: number, semantic = true): Promise<void> {
    await this.flush(epoch, signal); this.check(epoch, signal);
    const current = await this.transport.read(this.scope!, signal); this.check(epoch, signal);
    if (current.revision !== this.revision && reconcileRevision !== current.revision) throw new PublicationError("conflict", "Context changed; inspect current document and explicitly reconcile", current);
    if (canonical(current.document) === canonical(document)) { if (semantic) this.accepted = document; this.remote = document; this.revision = current.revision; return; }
    this.pending = { document, baseRevision: current.revision, requestId: randomUUID(), semantic };
    await this.flush(epoch, signal);
  }
  update(snapshot: FocusSnapshot, source: FocusSource, reconcileRevision?: number, operationSignal?: AbortSignal): Promise<FocusDocument> {
    // Detach immediately: a concurrent caller must not mutate queued input.
    const copy = structuredClone(snapshot); const pinned: FocusSource = structuredClone(source);
    return this.serialize(async (epoch, signal) => {
      if (!this.sameProducer(pinned, this.binding!)) throw new PublicationError("invalid", "Focus producer harness/session does not match the verified binding");
      await this.flush(epoch, signal); this.check(epoch, signal);
      const previous = this.accepted;
      if (reconcileRevision === undefined && previous && previous.freshness === "reviewed" && canonical(previous.source) === canonical(pinned) && canonical(snapshotOf(previous)) === canonical(copy) && canonical(previous) === canonical(this.remote)) {
        const current = await this.transport.read(this.scope!, signal); this.check(epoch, signal);
        if (current.revision !== this.revision || canonical(current.document) !== canonical(this.remote)) throw new PublicationError("conflict", "Context changed; inspect current document and explicitly reconcile", current);
        return previous;
      }
      const document: FocusDocument = {
        ...copy, schemaVersion: CONTEXT_SCHEMA_VERSION, source: pinned,
        updatedAt: this.now(), freshness: "reviewed", activity: this.observed ?? { state: "unknown", observedAt: this.now() },
      };
      if (!isFocusDocument(document)) throw new PublicationError("invalid", "Invalid bounded focus snapshot: use unique stable IDs, explicit owners and schema v3 limits");
      await this.store(document, epoch, signal, reconcileRevision); return this.accepted!;
    }, operationSignal);
  }
  activity(state: FocusDocument["activity"]["state"]): Promise<void> {
    return this.serialize(async (epoch, signal) => {
      await this.flush(epoch, signal);
      this.observed = { state, observedAt: this.now() };
      if (this.remote) await this.store({ ...this.remote, activity: this.observed }, epoch, signal, undefined, false);
    });
  }
  markUnreviewed(missed = false): Promise<void> {
    return this.serialize(async (epoch, signal) => {
      await this.flush(epoch, signal);
      if (this.remote) await this.store({ ...this.remote, freshness: missed ? "missed" : "unreviewed" }, epoch, signal, undefined, false);
    });
  }
}

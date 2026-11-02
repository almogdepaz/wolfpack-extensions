import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTEXT_SCHEMA_VERSION, canonical, isFocusDocument, type FocusDocument, type FocusHarness } from "./focus.ts";
import { PublicationError, type DocumentRead, type PublicationTransport, type VerifiedScope } from "./publisher.ts";
export type CommandRunner = (args: string[], signal: AbortSignal) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
const TARGET = "agent-context/context";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const command: CommandRunner = (args, signal) => new Promise((resolve, reject) => {
  execFile("wolfpack", args, { signal, timeout: 15_000, maxBuffer: 256 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
    if (signal.aborted) { reject(new PublicationError("superseded", "Publication cancelled with old binding")); return; }
    resolve({ stdout, stderr, exitCode: error ? typeof error.code === "number" ? error.code : 1 : 0 });
  });
});
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PublicationError("invalid", "Invalid structured CLI response");
  return value as Record<string, unknown>;
}
function scopeFields(value: Record<string, unknown>, scope: VerifiedScope): boolean {
  return value.scopeSessionId === scope.sessionId && value.extensionId === "agent-context" && value.documentId === "context";
}
export class CliTransport implements PublicationTransport {
  private installations = new WeakMap<VerifiedScope, string>();
  /** `harness` is the producer this adapter represents; the broker-verified session must run exactly it. */
  constructor(private readonly harness: FocusHarness, private readonly run: CommandRunner = command) {}
  private async json(args: string[], signal: AbortSignal, publishing = false): Promise<Record<string, unknown>> {
    const result = await this.run(args, signal);
    let body: Record<string, unknown>;
    try { body = object(JSON.parse(result.stdout)); }
    catch { throw new PublicationError(publishing ? "ambiguous" : "unavailable", "Wolfpack CLI returned no valid receipt; check CLI/host availability"); }
    if (result.exitCode !== 0 || body.ok === false) {
      const error = body.error && typeof body.error === "object" ? object(body.error) : {};
      if (error.code === "CONFLICT") throw new PublicationError("conflict", "Host CAS conflict; read and reconcile");
      throw new PublicationError("unavailable", `Wolfpack CLI rejected publication/identity (${typeof error.code === "string" ? error.code : "unknown error"})`);
    }
    return body;
  }
  async resolve(projectDir: string, signal: AbortSignal): Promise<VerifiedScope> {
    const body = await this.json(["session", "current-context", "--json"], signal);
    if (body.ok !== true || body.verified !== true || typeof body.sessionId !== "string" || !UUID.test(body.sessionId) || body.projectDir !== projectDir || body.harness !== this.harness) throw new PublicationError("invalid", `Expected exact verified ${this.harness} Wolfpack session and project; no name/environment fallback`);
    return { sessionId: body.sessionId, projectDir };
  }
  private async verify(scope: VerifiedScope, signal: AbortSignal): Promise<void> {
    const identity = await this.resolve(scope.projectDir, signal);
    if (identity.sessionId !== scope.sessionId) throw new PublicationError("superseded", "Verified Wolfpack session changed during publication");
  }
  async read(scope: VerifiedScope, signal: AbortSignal): Promise<DocumentRead> {
    await this.verify(scope, signal);
    const body = await this.json(["extension-data", "read", TARGET, "--session", scope.sessionId, "--json"], signal);
    const installation = this.installations.get(scope);
    if (!scopeFields(body, scope) || typeof body.installationId !== "string" || !UUID.test(body.installationId) || installation && installation !== body.installationId || !Number.isSafeInteger(body.revision) || (body.revision as number) < 0 || (body.document !== null && !isFocusDocument(body.document))) throw new PublicationError("invalid", `Context read identity/schema mismatch; schema v${CONTEXT_SCHEMA_VERSION} requires clean reinstall, never reinterpret older documents`);
    if ((body.revision === 0) !== (body.document === null)) throw new PublicationError("invalid", "Invalid document/revision pair");
    this.installations.set(scope, body.installationId);
    return { revision: body.revision as number, document: body.document as FocusDocument | null };
  }
  async publish(scope: VerifiedScope, document: FocusDocument, baseRevision: number, requestId: string, signal: AbortSignal): Promise<{ revision: number }> {
    await this.verify(scope, signal);
    if (!isFocusDocument(document) || !UUID.test(requestId) || !Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new PublicationError("invalid", "Invalid bounded focus publication operation");
    const directory = await mkdtemp(join(tmpdir(), "wolfpack-focus-"));
    try {
      const file = join(directory, "context.json"); await writeFile(file, JSON.stringify(document), { mode: 0o600 });
      const body = await this.json(["extension-data", "publish", TARGET, "--session", scope.sessionId, "--file", file, "--if-revision", String(baseRevision), "--request-id", requestId, "--json"], signal, true);
      if (!body.receipt || typeof body.receipt !== "object" || Array.isArray(body.receipt)) throw new PublicationError("ambiguous", "Publication response has no valid receipt; retry only the identical operation");
      const receipt = object(body.receipt);
      if (!scopeFields(receipt, scope) || receipt.requestId !== requestId || receipt.baseRevision !== baseRevision || receipt.revision !== baseRevision + 1 || receipt.schemaVersion !== CONTEXT_SCHEMA_VERSION || receipt.payloadDigest !== createHash("sha256").update(canonical(document)).digest("hex") || typeof receipt.acceptedAt !== "string" || !Number.isFinite(Date.parse(receipt.acceptedAt))) throw new PublicationError("ambiguous", "Publication receipt does not match the pinned operation; not marked synced");
      return { revision: receipt.revision as number };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}

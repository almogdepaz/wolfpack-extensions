import { expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { CliTransport, type CommandRunner } from "../src/cli.ts";
import { focusDocument } from "./focus-fixture.ts";
import { canonical } from "../src/focus.ts";
import { createHash } from "node:crypto";
const sessionId = "11111111-1111-4111-8111-111111111111";
const identity = { ok: true, verified: true, sessionId, projectDir: "/project", harness: "pi" };
const response = (body: unknown, exitCode = 0) => ({ stdout: JSON.stringify(body), stderr: "", exitCode });
test("CLI verifies exact identity/project/harness and refuses guessed, other-harness or malformed identity", async () => {
  for (const [harness, value] of [["pi", { ...identity, verified: false }], ["pi", { ...identity, sessionId: "name" }], ["pi", { ...identity, projectDir: "/wrong" }], ["pi", { ...identity, harness: "claude" }], ["claude", identity], ["claude", { ...identity, harness: "custom" }]] as const) {
    const transport = new CliTransport(harness, async () => response(value));
    await expect(transport.resolve("/project", new AbortController().signal)).rejects.toThrow();
  }
  const claude = new CliTransport("claude", async () => response({ ...identity, harness: "claude" }));
  expect(await claude.resolve("/project", new AbortController().signal)).toEqual({ sessionId, projectDir: "/project" });
});
test("CLI validates exact read/receipt scope and uses a private bounded JSON file", async () => {
  let path = "";
  const run: CommandRunner = async args => {
    if (args[0] === "session") return response(identity);
    if (args[1] === "read") return response({ installationId: sessionId, scopeSessionId: sessionId, extensionId: "agent-context", documentId: "context", revision: 0, document: null });
    path = args[args.indexOf("--file") + 1]!;
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(focusDocument);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    return response({ receipt: { requestId: sessionId, scopeSessionId: sessionId, extensionId: "agent-context", documentId: "context", revision: 1, baseRevision: 0, schemaVersion: 3, payloadDigest: createHash("sha256").update(canonical(focusDocument)).digest("hex"), acceptedAt: focusDocument.updatedAt } });
  };
  const transport = new CliTransport("pi", run); const signal = new AbortController().signal;
  const scope = await transport.resolve("/project", signal); await transport.read(scope, signal);
  expect(await transport.publish(scope, focusDocument, 0, sessionId, signal)).toEqual({ revision: 1 });
  expect(() => statSync(path)).toThrow();
});
test("CLI identity drift and cross-session reads never reach publication", async () => {
  let drift = false; const run: CommandRunner = async args => args[0] === "session" ? response(drift ? { ...identity, sessionId: "22222222-2222-4222-8222-222222222222" } : identity) : response({ installationId: sessionId, scopeSessionId: "wrong", extensionId: "agent-context", documentId: "context", revision: 0, document: null });
  const transport = new CliTransport("pi", run); const signal = new AbortController().signal;
  const scope = await transport.resolve("/project", signal);
  await expect(transport.read(scope, signal)).rejects.toThrow(); drift = true;
  await expect(transport.publish(scope, focusDocument, 0, sessionId, signal)).rejects.toThrow();
});


test("missing or malformed success receipts remain ambiguous so retries retain the operation id", async () => {
  for (const body of [{}, { receipt: null }, { receipt: [] }]) {
    const transport = new CliTransport("pi", async args => args[0] === "session" ? response(identity) : response(body));
    const signal = new AbortController().signal; const scope = await transport.resolve("/project", signal);
    await expect(transport.publish(scope, focusDocument, 0, sessionId, signal)).rejects.toMatchObject({ code: "ambiguous" });
  }
});

test("receipts must carry the current schema version", async () => {
  const transport = new CliTransport("pi", async args => args[0] === "session" ? response(identity) : response({ receipt: { requestId: sessionId, scopeSessionId: sessionId, extensionId: "agent-context", documentId: "context", revision: 1, baseRevision: 0, schemaVersion: 2, payloadDigest: createHash("sha256").update(canonical(focusDocument)).digest("hex"), acceptedAt: focusDocument.updatedAt } }));
  const signal = new AbortController().signal; const scope = await transport.resolve("/project", signal);
  await expect(transport.publish(scope, focusDocument, 0, sessionId, signal)).rejects.toMatchObject({ code: "ambiguous" });
});

#!/usr/bin/env bun
import { strict as assert } from "node:assert";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertClaudeBundle, assertClaudePlugin, assertPiBundle, assertSelfContained } from "./bundle-policy.ts";
import { isolatedPackageManagerEnv } from "./package-env.ts";
const root = join(import.meta.dirname, ".."), stage = mkdtempSync(join(tmpdir(), "wolfpack-agent-context-negative-"));
try {
  const copy = join(stage, "project"); mkdirSync(copy);
  for (const name of ["package.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "src", "pi", "claude", "dist", "scripts", "schemas", "skills", ".claude-plugin", "hooks"]) cpSync(join(root, name), join(copy, name), { recursive: true });
  const env = isolatedPackageManagerEnv(stage);
  const reject = (label: string, mutate: () => void, expected: RegExp) => {
    const fixture = join(stage, label); cpSync(copy, fixture, { recursive: true }); symlinkSync(join(root, "..", "..", "node_modules"), join(fixture, "node_modules"), "dir"); mutateFixture(fixture, mutate);
    for (const command of [[process.execPath, join(fixture, "scripts", "check-package.ts")], [process.execPath, "run", "pack"]]) {
      const result = Bun.spawnSync(command, { cwd: fixture, env, stdout: "pipe", stderr: "pipe" }), output = result.stdout.toString() + result.stderr.toString();
      assert.notEqual(result.exitCode, 0, `${label}: ${command.join(" ")} unexpectedly succeeded`); assert.match(output, expected, `${label}: ${output}`); assert.equal(readdirSync(fixture).some(name => name.endsWith(".tgz")), false, `${label}: failed gate emitted archive`);
    }
  };
  let current = copy;
  const mutateFixture = (fixture: string, mutate: () => void) => { current = fixture; mutate(); };
  const manifest = (change: (value: any) => void) => () => { const path = join(current, "package.json"), value = JSON.parse(readFileSync(path, "utf8")); change(value); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); };
  reject("stale-source", () => { const path = join(current, "src", "ui.ts"), source = readFileSync(path, "utf8"), stale = source.replace('title: "Agent Context"', 'title: "Stale source counterfactual"'); assert.notEqual(stale, source); writeFileSync(path, stale); }, /SOURCE_ONLY_DRIFT/);
  reject("missing-document", manifest(value => { value.wolfpack.documents = []; }), /exact APIv1 document/);
  reject("wrong-manifest-version", manifest(value => { value.wolfpack.manifestVersion = 2; }), /exact APIv1 document/);
  reject("wrong-schema-version", manifest(value => { value.wolfpack.documents[0].schemaVersion = 1; }), /exact APIv1 document/);
  reject("wrong-schema-path", manifest(value => { value.wolfpack.documents[0].schema = "schemas/other.json"; }), /exact APIv1 document/);
  reject("altered-schema", () => writeFileSync(join(current, "schemas", "context.schema.json"), "{}\n"), /FROZEN_SCHEMA_DRIFT/);
  reject("missing-pi-resource", manifest(value => { value.pi.extensions = []; }), /explicitly expose only the Pi companion/);
  reject("wrong-pi-peer", manifest(value => { value.peerDependencies.typebox = "1"; }), /host-provided peers/);
  reject("stale-pi-source", () => { const path = join(current, "pi", "index.ts"); writeFileSync(path, readFileSync(path, "utf8").replace('label: "Update session focus"', 'label: "Stale companion"')); }, /SOURCE_ONLY_DRIFT/);
  reject("stale-claude-source", () => { const path = join(current, "claude", "server.ts"); const source = readFileSync(path, "utf8"), stale = source.replace('version: "0.1.0"', 'version: "0.0.0-stale"'); assert.notEqual(stale, source); writeFileSync(path, stale); }, /SOURCE_ONLY_DRIFT/);
  const hooks = (change: (value: any) => void) => () => { const path = join(current, "hooks", "hooks.json"), value = JSON.parse(readFileSync(path, "utf8")); change(value); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); };
  reject("hook-forwards-prompt", hooks(value => { value.hooks.UserPromptSubmit[0].hooks[0].input.prompt = "${prompt}"; }), /CLAUDE_PLUGIN/);
  reject("hook-forwards-tool-output", hooks(value => { value.hooks.PostToolUse[0].hooks[0].input.tool_use_id = "${tool_response}"; }), /CLAUDE_PLUGIN/);
  reject("hook-wrong-server", hooks(value => { value.hooks.Stop[0].hooks[0].server = "focus"; }), /CLAUDE_PLUGIN/);
  reject("hook-unbounded", hooks(value => { delete value.hooks.Stop[0].hooks[0].timeout; }), /CLAUDE_PLUGIN/);
  reject("hook-substring-matcher", hooks(value => { value.hooks.PreToolUse[0].matcher = "update_focus"; }), /CLAUDE_PLUGIN/);
  reject("missing-stop-hook", hooks(value => { delete value.hooks.Stop; }), /CLAUDE_PLUGIN/);
  reject("launch-mcp-session-start", hooks(value => { delete value.hooks.SessionStart[1].matcher; }), /CLAUDE_PLUGIN/);
  reject("resume-mcp-session-start", hooks(value => { value.hooks.SessionStart[1].matcher = "resume|clear|compact"; }), /CLAUDE_PLUGIN/);
  reject("missing-batch-hook", hooks(value => { delete value.hooks.PostToolBatch; }), /CLAUDE_PLUGIN/);
  reject("batch-forwards-tool-calls", hooks(value => { value.hooks.PostToolBatch[0].hooks[0].input.agent_id = "${tool_calls}"; }), /CLAUDE_PLUGIN/);
  reject("missing-claude-hooks", () => unlinkSync(join(current, "hooks", "hooks.json")), /unexpected packed files|ENOENT/);
  reject("wrong-claude-server", () => { const path = join(current, ".claude-plugin", "plugin.json"), value = JSON.parse(readFileSync(path, "utf8")); value.mcpServers.focus.args = ["${CLAUDE_PLUGIN_ROOT}/../outside.mjs"]; writeFileSync(path, JSON.stringify(value)); }, /CLAUDE_PLUGIN/);
  reject("missing-notice", () => { const path = join(current, "THIRD_PARTY_NOTICES.md"); writeFileSync(path, readFileSync(path, "utf8").replace(/^## ajv@.*$/m, "## removed")); }, /THIRD_PARTY_NOTICES/);
  reject("missing-skill", () => unlinkSync(join(current, "skills", "wolfpack-agent-context", "SKILL.md")), /unexpected packed files|ENOENT/);
  reject("missing-reference", () => unlinkSync(join(current, "skills", "wolfpack-agent-context", "references", "context-format.md")), /unexpected packed files|ENOENT/);
  for (const value of ["if (false) import('dormant-dependency');", "import 'side-effect';", "function dormant() { return require('dependency'); }"]) assert.throws(() => assertSelfContained(Buffer.from(value)), /external dependency syntax/);
  assert.throws(() => assertPiBundle(Buffer.from("import 'unapproved-dependency';")), /unexpected Pi companion import/);
  assert.throws(() => assertPiBundle(Buffer.from("import('typebox');")), /unexpected dynamic Pi companion dependency/);
  for (const value of ["import 'express';", "import { z } from 'zod';", "const m = await import('node:fs');", "const m = require('ajv');"]) assert.throws(() => assertClaudeBundle(Buffer.from(value)), /Claude server|Claude bundle/);
  assert.doesNotThrow(() => assertClaudeBundle(Buffer.from("import process from 'node:process'; const code = `require(\"ajv/dist/runtime/equal\")`;")));
  assert.throws(() => assertClaudePlugin({ name: "wolfpack-agent-context", mcpServers: { focus: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/claude.mjs"] } }, hooks: "./extra.json" }, JSON.parse(readFileSync(join(root, "hooks", "hooks.json"), "utf8"))), /CLAUDE_PLUGIN/);
  process.stdout.write("actual checker/pack reject stale browser/Pi/Claude source, raw-content or unscoped Claude hooks, wrong plugin server, missing notices, exact manifest/schema/peers/resources and required assets\n");
} finally { rmSync(stage, { recursive: true, force: true }); }

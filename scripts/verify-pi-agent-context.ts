#!/usr/bin/env bun
/** Selected Pi peer type/load gate. No installation, settings changes, model or live host calls. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const pi = process.env.WOLFPACK_PI_PACKAGE_ROOT;
if (!pi) throw new Error("set WOLFPACK_PI_PACKAGE_ROOT to the selected @earendil-works/pi-coding-agent package directory (tested 1.4.0)");
const root = resolve(import.meta.dirname, ".."), stage = mkdtempSync(join(tmpdir(), "wolfpack-agent-context-pi-compat-"));
try {
  const config = join(stage, "tsconfig.json");
  writeFileSync(config, JSON.stringify({ compilerOptions: { target: "ESNext", module: "preserve", moduleResolution: "bundler", allowImportingTsExtensions: true, noEmit: true, strict: true, skipLibCheck: true, resolveJsonModule: true, types: ["bun-types"], typeRoots: [join(root, "node_modules")], paths: { "@earendil-works/pi-coding-agent": [join(pi, "dist/index.d.ts")], typebox: [resolve(pi, "../../typebox/build/index.d.mts")] } }, files: [join(root, "packages/agent-context/pi/index.ts")] }));
  const result = Bun.spawnSync([join(root, "node_modules/.bin/tsc"), "-p", config], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
  const { loadExtensions } = await import(join(pi, "dist/core/extensions/loader.js"));
  const loaded = await loadExtensions([join(root, "packages/agent-context/dist/pi.js")], stage);
  if (loaded.errors.length || loaded.extensions.length !== 1) throw new Error(`Pi load failure: ${JSON.stringify(loaded.errors)}`);
  const extension = loaded.extensions[0]; const tool = extension.tools.get("update_focus");
  if (!tool || tool.definition.exposure !== "model-only" || tool.definition.executionMode !== "sequential" || !extension.handlers.has("agent_before_settle") || !extension.handlers.has("agent_settled") || extension.handlers.has("agent_end")) throw new Error("Pi companion tool/lifecycle registration mismatch");
  const version = JSON.parse(readFileSync(join(pi, "package.json"), "utf8")).version;
  process.stdout.write(`selected Pi ${version}: strict companion types, built resource load and settlement hooks passed\n`);
} finally { rmSync(stage, { recursive: true, force: true }); }

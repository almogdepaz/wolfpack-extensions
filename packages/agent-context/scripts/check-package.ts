#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertClaudeBundle, assertClaudePlugin, assertPiBundle, assertSelfContained } from "./bundle-policy.ts";
import { buildBundle } from "./build-bundle.ts";
import { isolatedPackageManagerEnv } from "./package-env.ts";

const root = join(import.meta.dirname, ".."), stage = mkdtempSync(join(tmpdir(), "wolfpack-agent-context-pack-"));
const schemaPath = "schemas/context.schema.json", skillPath = "skills/wolfpack-agent-context/SKILL.md", referencePath = "skills/wolfpack-agent-context/references/context-format.md";
const pluginPath = ".claude-plugin/plugin.json", hooksPath = "hooks/hooks.json", noticesPath = "THIRD_PARTY_NOTICES.md";
const requiredFiles = ["LICENSE", "README.md", "dist/ui.js", "dist/pi.js", "dist/claude.mjs", "package.json", schemaPath, skillPath, referencePath, pluginPath, hooksPath, noticesPath].sort();
const FROZEN_SCHEMA_SHA256 = "d6e0af21b7d8a0d3127cd714b30a500a1358115bbdb4ccda9fba6283afd2ab29";
function fail(message: string): never { throw new Error(`PACKAGE_GATE: ${message}`); }
function exactManifest(manifest: any): void {
  const documents = [{ id: "context", schemaVersion: 3, schema: schemaPath }];
  if (JSON.stringify(manifest.pi) !== JSON.stringify({ extensions: ["dist/pi.js"], skills: [], prompts: [], themes: [] }) || JSON.stringify(manifest.peerDependencies) !== JSON.stringify({ "@earendil-works/pi-coding-agent": "*", typebox: "*" })) fail("Agent Context must explicitly expose only the Pi companion with host-provided peers");
  if (manifest.private === true || manifest.name !== "wolfpack-extension-agent-context" || manifest.version !== "0.1.0" || manifest.dependencies || manifest.optionalDependencies || manifest.wolfpack?.manifestVersion !== 1 || manifest.wolfpack?.apiVersion !== 1 || manifest.wolfpack?.id !== "agent-context" || manifest.wolfpack?.ui !== "dist/ui.js" || JSON.stringify(manifest.wolfpack?.skills) !== '["skills/wolfpack-agent-context"]' || JSON.stringify(manifest.wolfpack?.documents) !== JSON.stringify(documents)) fail("Agent Context manifest must declare the exact APIv1 document/schema/skill contract");
  if (Object.keys(manifest.scripts ?? {}).some(key => /^(pre|post)?install$/.test(key))) fail("packed manifest must not declare lifecycle installation scripts");
}
try {
  const sourceSchema = readFileSync(join(root, schemaPath));
  if (createHash("sha256").update(sourceSchema).digest("hex") !== FROZEN_SCHEMA_SHA256) fail("FROZEN_SCHEMA_DRIFT: Agent Context schema bytes changed");
  const fresh = join(stage, "fresh-dist"); const { claudePackages } = await buildBundle(root, fresh);
  const sourceBundle = readFileSync(join(root, "dist", "ui.js")), rebuilt = readFileSync(join(fresh, "ui.js"));
  if (!sourceBundle.equals(rebuilt)) fail("SOURCE_ONLY_DRIFT: fresh src/ui.ts build differs from checked-in dist/ui.js"); assertSelfContained(sourceBundle);
  const sourcePi = readFileSync(join(root, "dist", "pi.js"));
  if (!sourcePi.equals(readFileSync(join(fresh, "pi.js")))) fail("SOURCE_ONLY_DRIFT: fresh pi/index.ts build differs from checked-in dist/pi.js"); assertPiBundle(sourcePi);
  const sourceClaude = readFileSync(join(root, "dist", "claude.mjs"));
  if (!sourceClaude.equals(readFileSync(join(fresh, "claude.mjs")))) fail("SOURCE_ONLY_DRIFT: fresh claude/server.ts build differs from checked-in dist/claude.mjs"); assertClaudeBundle(sourceClaude);
  const noticed = [...readFileSync(join(root, noticesPath), "utf8").matchAll(/^## (\S+) — (\S+)$/gm)].map(match => `${match[1]} ${match[2]}`).sort();
  if (JSON.stringify(noticed) !== JSON.stringify(claudePackages.map(item => `${item.name}@${item.version} ${item.license}`).sort())) fail(`THIRD_PARTY_NOTICES must list exactly the bundled packages: ${claudePackages.map(item => `${item.name}@${item.version}`).join(", ")}`);
  assertClaudePlugin(JSON.parse(readFileSync(join(root, pluginPath), "utf8")), JSON.parse(readFileSync(join(root, hooksPath), "utf8")));
  exactManifest(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  const packed = Bun.spawnSync(["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", stage], { cwd: root, env: isolatedPackageManagerEnv(stage), stdout: "pipe", stderr: "pipe" });
  if (packed.exitCode !== 0) fail(packed.stderr.toString()); const info = JSON.parse(packed.stdout.toString())[0] as { filename: string; files: Array<{ path: string }> };
  const paths = info.files.map(file => file.path).sort(); if (paths.join("|") !== requiredFiles.join("|")) fail(`unexpected packed files: ${paths.join(", ")}`);
  const archive = join(stage, info.filename); if (!existsSync(archive) || Bun.spawnSync(["tar", "-xzf", archive, "-C", stage]).exitCode !== 0) fail("could not unpack npm artifact");
  const shipped = join(stage, "package"); exactManifest(JSON.parse(readFileSync(join(shipped, "package.json"), "utf8")));
  for (const path of [schemaPath, skillPath, referencePath, pluginPath, hooksPath, noticesPath]) if (!readFileSync(join(shipped, path)).equals(readFileSync(join(root, path)))) fail(`PACKED_ASSET_DRIFT: ${path} differs from reviewed source`);
  const bundle = readFileSync(join(shipped, "dist", "ui.js")); if (!bundle.equals(sourceBundle) || bundle.byteLength > 1024 * 1024) fail("packed bundle is stale, altered, or exceeds 1 MiB"); assertSelfContained(bundle);
  const piBundle = readFileSync(join(shipped, "dist", "pi.js"));
  if (!piBundle.equals(sourcePi) || piBundle.byteLength > 1024 * 1024) fail("packed Pi companion is stale, altered, or exceeds 1 MiB"); assertPiBundle(piBundle);
  const claudeBundle = readFileSync(join(shipped, "dist", "claude.mjs"));
  if (!claudeBundle.equals(sourceClaude) || claudeBundle.byteLength > 1024 * 1024) fail("packed Claude server is stale, altered, or exceeds 1 MiB"); assertClaudeBundle(claudeBundle);
  assertClaudePlugin(JSON.parse(readFileSync(join(shipped, pluginPath), "utf8")), JSON.parse(readFileSync(join(shipped, hooksPath), "utf8")));
  // The shipped guidance entry runs from the unpacked archive with no installed dependencies, and stays silent
  // outside a verified Wolfpack Claude session (this isolated environment has no broker identity).
  const guidance = Bun.spawnSync(["node", join(shipped, "dist", "claude.mjs"), "session-start"], { cwd: stage, env: { ...isolatedPackageManagerEnv(stage), CLAUDE_PROJECT_DIR: stage }, stdout: "pipe", stderr: "pipe" });
  if (guidance.exitCode !== 0 || guidance.stdout.toString() !== "") fail(`packed Claude guidance entry must exit 0 silently when unverified: ${guidance.stdout.toString()}${guidance.stderr.toString()}`);
  const module = await import(pathToFileURL(join(shipped, "dist", "ui.js")).href), views: string[] = [], layouts: string[] = [];
  module.default({ registerContextView: (view: { id: string }) => views.push(view.id), registerTerminalLayout: (layout: { id: string }) => layouts.push(layout.id) });
  if (views.join("|") !== "context" || layouts.length) fail("packed bundle does not provide only the Agent Context view");
  process.stdout.write(`${archive}\nsha512-${createHash("sha512").update(readFileSync(archive)).digest("base64")}\n`);
} finally { rmSync(stage, { recursive: true, force: true }); }

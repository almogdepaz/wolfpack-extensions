#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isolatedPackageManagerEnv } from "./package-env.ts";
import { assertSelfContained } from "./bundle-policy.ts";
import { buildBundle } from "./build-bundle.ts";

const root = join(import.meta.dirname, "..");
const stage = mkdtempSync(join(tmpdir(), "wolfpack-changes-pack-"));
function fail(message: string): never { throw new Error(`PACKAGE_GATE: ${message}`); }
try {
  const fresh = join(stage, "fresh-dist");
  await buildBundle(root, fresh);
  const shippedSource = readFileSync(join(root, "dist", "ui.js")), freshSource = readFileSync(join(fresh, "ui.js"));
  if (!shippedSource.equals(freshSource)) fail("SOURCE_ONLY_DRIFT: fresh src/ui.ts build differs from checked-in dist/ui.js");
  assertSelfContained(shippedSource);
  const packed = Bun.spawnSync(["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", stage], { cwd: root, env: isolatedPackageManagerEnv(stage), stdout: "pipe", stderr: "pipe" });
  if (packed.exitCode !== 0) fail(packed.stderr.toString());
  const info = JSON.parse(packed.stdout.toString())[0] as { filename: string; files: Array<{ path: string }> };
  const expected = ["LICENSE", "README.md", "dist/ui.js", "package.json"], paths = info.files.map(file => file.path).sort();
  if (paths.join("|") !== expected.join("|")) fail(`unexpected packed files: ${paths.join(", ")}`);
  const archive = join(stage, info.filename);
  if (!existsSync(archive)) fail("npm pack did not create its archive");
  if (Bun.spawnSync(["tar", "-xzf", archive, "-C", stage]).exitCode !== 0 || !existsSync(join(stage, "package"))) fail("could not unpack npm artifact");
  const shipped = join(stage, "package"), manifest = JSON.parse(readFileSync(join(shipped, "package.json"), "utf8"));
  if (manifest.private === true || manifest.name !== "wolfpack-extension-changes" || manifest.version !== "0.1.1" || manifest.dependencies || manifest.optionalDependencies || manifest.peerDependencies || manifest.wolfpack?.manifestVersion !== 1 || manifest.wolfpack?.apiVersion !== 1 || manifest.wolfpack?.id !== "changes" || manifest.wolfpack?.ui !== "dist/ui.js" || JSON.stringify(manifest.wolfpack?.skills) !== "[]" || JSON.stringify(manifest.wolfpack?.documents) !== "[]") fail("packed manifest is not the dependency-free Changes APIv1 release manifest");
  if (Object.keys(manifest.scripts ?? {}).some(key => /^(pre|post)?install$/.test(key))) fail("packed manifest must not declare lifecycle installation scripts");
  const bundle = readFileSync(join(shipped, "dist", "ui.js"));
  if (!bundle.equals(shippedSource) || bundle.byteLength > 1024 * 1024) fail("packed bundle is stale, altered, or exceeds the host 1 MiB limit");
  assertSelfContained(bundle);
  const module = await import(pathToFileURL(join(shipped, "dist", "ui.js")).href), views: string[] = [], layouts: string[] = [];
  module.default({ registerContextView: (view: { id: string }) => views.push(view.id), registerTerminalLayout: (layout: { title: string }) => layouts.push(layout.title) });
  if (typeof module.default !== "function" || views.join("|") !== "changes" || layouts.length !== 0) fail("packed bundle does not provide the Changes default-registration contract");
  process.stdout.write(`${archive}\nsha512-${createHash("sha512").update(readFileSync(archive)).digest("base64")}\n`);
} finally { rmSync(stage, { recursive: true, force: true }); }

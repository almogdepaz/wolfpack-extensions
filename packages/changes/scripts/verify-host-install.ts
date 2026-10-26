#!/usr/bin/env bun
/** Optional APIv1-host proof; normal package development never imports a host. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isolatedPackageManagerEnv } from "./package-env.ts";

const hostRoot = process.env.WOLFPACK_EXTENSION_HOST_ROOT;
if (!hostRoot || !existsSync(join(hostRoot, "src", "extensions", "runtime.ts"))) throw new Error("set WOLFPACK_EXTENSION_HOST_ROOT to an APIv1 Wolfpack checkout");
const root = join(import.meta.dirname, "..");
const stage = mkdtempSync(join(tmpdir(), "wolfpack-changes-isolated-install-"));
const originalHome = process.env.HOME ?? "";
const sentinel = join(originalHome, ".wolfpack", "extensions", "registry.json");
const sentinelHash = existsSync(sentinel) ? createHash("sha256").update(readFileSync(sentinel)).digest("hex") : "absent";
const hash = (path: string) => existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "absent";
try {
  const packed = Bun.spawnSync(["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", stage], { cwd: root, env: isolatedPackageManagerEnv(stage), stdout: "pipe", stderr: "pipe" });
  if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
  const pack = JSON.parse(packed.stdout.toString())[0] as { filename: string; files: Array<{ path: string }> };
  const archivePath = join(stage, pack.filename), archive = readFileSync(archivePath);
  const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
  const unpacked = join(stage, "unpacked"); mkdirSync(unpacked);
  if (Bun.spawnSync(["tar", "-xzf", archivePath, "-C", unpacked]).exitCode !== 0) throw new Error("cannot unpack exact archive");
  const source = join(unpacked, "package");
  const served = new Set<string>(); let registry!: ReturnType<typeof Bun.serve>;
  registry = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/wolfpack-extension-changes/0.1.1") { served.add("metadata"); return Response.json({ name: "wolfpack-extension-changes", version: "0.1.1", dist: { tarball: `${registry.url.origin}/wolfpack-extension-changes-0.1.1.tgz`, integrity } }); }
    if (path === "/wolfpack-extension-changes-0.1.1.tgz") { served.add("tarball"); return new Response(archive); }
    return new Response("not found", { status: 404 });
  } });
  try {
    // Fixture-only registry injection proves bounded SRI acquisition. It is not a CLI registry override.
    const runtimeHome = join(stage, "runtime-home"); const previousHome = process.env.HOME; process.env.HOME = runtimeHome;
    try {
      const { ExtensionRuntime } = await import(pathToFileURL(join(hostRoot, "src", "extensions", "runtime.ts")).href);
      const runtime = new ExtensionRuntime({ root: join(runtimeHome, ".wolfpack", "extensions"), installationId: "11111111-1111-4111-8111-111111111111" });
      const installed = await runtime.install({ source: "npm:wolfpack-extension-changes@0.1.1", registryUrl: registry.url.origin, trustBrowserCode: true });
      const item = runtime.catalog().installations[0], asset = runtime.asset("changes", installed.installation.package.digest, "dist/ui.js");
      if (!item || item.package.version !== "0.1.1" || item.ui?.path !== "dist/ui.js" || !asset.bytes.toString().includes("wolfpack-changes") || !served.has("metadata") || !served.has("tarball")) throw new Error("SRI runtime fixture did not install the allowlisted bundle");
    } finally { if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome; }
    // Public CLI uses the exact unpacked archive; it intentionally receives no registry override.
    const cliHome = join(stage, "cli-home"); mkdirSync(cliHome, { recursive: true });
    const cliEnv = { ...isolatedPackageManagerEnv(join(stage, "cli-package-manager")), HOME: cliHome, TMPDIR: join(stage, "tmp"), SHELL: "/bin/sh" };
    const cli = (...args: string[]) => Bun.spawnSync([process.execPath, join(hostRoot, "src", "cli", "index.ts"), ...args], { cwd: stage, env: cliEnv, stdout: "pipe", stderr: "pipe" });
    for (const args of [["extensions", "install", source, "--trust-browser-code"], ["extensions", "list", "--json"], ["extensions", "update", source, "--trust-browser-code"], ["extensions", "remove", "changes"]]) {
      const result = cli(...args); if (result.exitCode !== 0) throw new Error(`public CLI ${args.join(" ")} failed: ${result.stderr.toString()}`);
      if (args[1] === "list" && !result.stdout.toString().includes("wolfpack-extension-changes")) throw new Error("public CLI list omitted installed exact archive");
    }
    if (hash(sentinel) !== sentinelHash) throw new Error("isolated proof touched the real HOME extension registry");
    writeFileSync(join(stage, "receipt.json"), JSON.stringify({ integrity, files: pack.files.map(file => file.path).sort(), cliHome }));
    process.stdout.write(JSON.stringify({ integrity, files: pack.files.map(file => file.path).sort(), cliHome, runtimeHome, realRegistryUntouched: true }) + "\n");
  } finally { registry.stop(true); }
} finally { rmSync(stage, { recursive: true, force: true }); }

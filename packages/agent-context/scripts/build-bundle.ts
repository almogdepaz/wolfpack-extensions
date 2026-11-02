import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface BundledPackage { readonly name: string; readonly version: string; readonly license: string }
/** Explicit paths shared by normal builds and temporary release validation. */
export async function buildBundle(root: string, output: string): Promise<{ readonly claudePackages: readonly BundledPackage[] }> {
  mkdirSync(output, { recursive: true });
  const result = await Bun.build({
    root, entrypoints: [join(root, "src", "ui.ts")], outdir: output, naming: "ui.js",
    format: "esm", target: "browser", minify: false, sourcemap: "none",
  });
  if (!result.success) throw new Error(`Agent Context browser bundle failed: ${result.logs.map(log => log.message).join("; ")}`);
  const companion = await Bun.build({
    root, entrypoints: [join(root, "pi", "index.ts")], outdir: output, naming: "pi.js",
    format: "esm", target: "node", minify: false, sourcemap: "none",
    external: ["@earendil-works/pi-coding-agent", "typebox"],
  });
  if (!companion.success) throw new Error(`Agent Context Pi bundle failed: ${companion.logs.map(log => log.message).join("; ")}`);
  // Claude Code plugin server: the official MCP SDK and its schema dependency are bundled at build time,
  // so installed plugins need only Node and no package installation.
  const claude = await Bun.build({
    root, entrypoints: [join(root, "claude", "server.ts")], outdir: output, naming: "claude.mjs",
    // Whitespace minification drops dependency path comments so the artifact is independent of the local
    // node_modules layout; identifiers and syntax stay unminified for review.
    format: "esm", target: "node", minify: { whitespace: true, identifiers: false, syntax: false }, sourcemap: "none", metafile: true,
  });
  if (!claude.success || !claude.metafile) throw new Error(`Agent Context Claude bundle failed: ${claude.logs.map(log => log.message).join("; ")}`);
  // Exact third-party package set compiled into dist/claude.mjs, for notices and boundary gates.
  const packages = new Map<string, BundledPackage>();
  for (const input of Object.keys(claude.metafile.inputs)) {
    const at = input.lastIndexOf("node_modules/"); if (at < 0) continue;
    const rest = input.slice(at + "node_modules/".length).split("/"), name = rest[0]!.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0]!;
    const manifest = JSON.parse(readFileSync(resolve(input.slice(0, at), "node_modules", name, "package.json"), "utf8")) as { version: string; license?: string };
    packages.set(`${name}@${manifest.version}`, { name, version: manifest.version, license: manifest.license ?? "UNKNOWN" });
  }
  return { claudePackages: [...packages.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1) };
}

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Deliberately small package-manager environment for local verification. */
export function isolatedPackageManagerEnv(root: string): Record<string, string> {
  const home = join(root, "home"), cache = join(root, "cache"), temp = join(root, "tmp"), config = join(root, "npmrc");
  for (const path of [home, cache, temp]) mkdirSync(path, { recursive: true, mode: 0o700 });
  writeFileSync(config, "ignore-scripts=true\nregistry=https://registry.npmjs.org/\n", { mode: 0o600 });
  return {
    PATH: process.env.PATH ?? "", HOME: home, TMPDIR: temp, XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: cache,
    npm_config_userconfig: config, NPM_CONFIG_USERCONFIG: config, npm_config_cache: cache, NPM_CONFIG_CACHE: cache,
    npm_config_ignore_scripts: "true", NPM_CONFIG_IGNORE_SCRIPTS: "true", BUN_INSTALL_CACHE_DIR: join(cache, "bun"),
  };
}

/**
 * Test-time shipping artifact: the package exactly as `npm pack` ships it (package-gate flags), unpacked to a plain
 * directory. Workspace sources can carry package-manager links (e.g. Bun's isolated node_modules) that the host
 * correctly rejects; fixtures install and read this instead.
 */
export function unpackShippedPackage(packageRoot: string, stage: string): string {
  const destination = join(stage, "shipped");
  mkdirSync(destination, { recursive: true });
  const packed = Bun.spawnSync(["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", destination], { cwd: packageRoot, env: isolatedPackageManagerEnv(join(stage, "npm")), stdout: "pipe", stderr: "pipe" });
  if (packed.exitCode !== 0) throw new Error(`npm pack failed: ${packed.stderr.toString()}`);
  const [info] = JSON.parse(packed.stdout.toString()) as Array<{ filename: string }>;
  if (!info || Bun.spawnSync(["tar", "-xzf", join(destination, info.filename), "-C", destination]).exitCode !== 0) throw new Error("could not unpack the npm artifact");
  return join(destination, "package");
}

#!/usr/bin/env bun
/** Verify this monorepo from a copied root, never an ambient sibling checkout. */
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = join(import.meta.dirname, ".."), target = mkdtempSync(join(tmpdir(), "wolfpack-extensions-portable-"));
try {
  for (const name of readdirSync(source)) {
    if ([".git", "node_modules", ".gitignore"].includes(name)) continue;
    cpSync(join(source, name), join(target, name), { recursive: true });
  }
  const env = { ...process.env, HOME: join(target, "home"), TMPDIR: join(target, "tmp"), npm_config_cache: join(target, "cache"), npm_config_userconfig: join(target, "npmrc"), npm_config_ignore_scripts: "true" };
  for (const command of [["bun", "install", "--offline", "--frozen-lockfile", "--ignore-scripts", "--omit=peer"], ["bun", "run", "build"], ["bun", "run", "typecheck"], ["bun", "run", "check:package"]]) {
    const result = Bun.spawnSync(command, { cwd: target, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(`${command.join(" ")} failed outside source root: ${result.stderr.toString() || result.stdout.toString()}`);
  }
  process.stdout.write("portable root build/typecheck/package gate passed\n");
} finally { rmSync(target, { recursive: true, force: true }); }

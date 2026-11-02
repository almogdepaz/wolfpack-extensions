import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../package.json";
import { CLAUDE_FOCUS_TOOL_ID, CLAUDE_HOOK_SERVER, CLAUDE_LIFECYCLE_TOOL, CLAUDE_PLUGIN_NAME, CLAUDE_SERVER_KEY, parseLifecycle } from "../src/claude.ts";
import { matcherSelects, renderHookInput, type NativeHookGroup } from "./claude-native.ts";

const root = join(import.meta.dirname, "..");
const json = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
test("one package explicitly loads its companion without duplicate skill ownership", () => {
  expect((manifest as any).pi).toEqual({ extensions: ["dist/pi.js"], skills: [], prompts: [], themes: [] });
  expect(manifest.wolfpack.documents[0]?.schemaVersion).toBe(3);
  expect((manifest as any).dependencies).toBeUndefined();
  expect((manifest as any).peerDependencies).toEqual({ "@earendil-works/pi-coding-agent": "*", typebox: "*" });
});

test("Claude plugin declares one stdio server under the exact scoped names used by hooks", () => {
  const plugin = json(".claude-plugin/plugin.json");
  expect(plugin.name).toBe(CLAUDE_PLUGIN_NAME);
  expect(plugin.mcpServers).toEqual({ [CLAUDE_SERVER_KEY]: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/claude.mjs"] } });
  expect(CLAUDE_HOOK_SERVER).toBe(`plugin:${CLAUDE_PLUGIN_NAME}:${CLAUDE_SERVER_KEY}`);
  expect(CLAUDE_FOCUS_TOOL_ID).toBe("mcp__plugin_wolfpack-agent-context_focus__update_focus");
  const marketplace = JSON.parse(readFileSync(join(root, "..", "..", ".claude-plugin", "marketplace.json"), "utf8"));
  expect(marketplace.plugins).toEqual([expect.objectContaining({ name: CLAUDE_PLUGIN_NAME, source: "./packages/agent-context" })]);
});

const events: Record<string, Record<string, unknown>> = {
  SessionStart: { session_id: "s", transcript_path: "/t", cwd: "/p", hook_event_name: "SessionStart", source: "clear", model: "claude-opus" },
  UserPromptSubmit: { session_id: "s", prompt_id: "p", transcript_path: "/t", cwd: "/p", hook_event_name: "UserPromptSubmit", prompt: "secret user text" },
  PreToolUse: { session_id: "s", prompt_id: "p", hook_event_name: "PreToolUse", tool_name: CLAUDE_FOCUS_TOOL_ID, tool_input: { snapshot: { goal: "raw" } }, tool_use_id: "toolu_1", mcp_server: { name: CLAUDE_HOOK_SERVER, source: "plugin" } },
  PostToolUse: { session_id: "s", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "cat secret" }, tool_response: { stdout: "secret" }, tool_use_id: "toolu_2", agent_id: "agent-1" },
  PostToolUseFailure: { session_id: "s", hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "x" }, tool_use_id: "toolu_3", error: "Exit code 1\nsecret", is_interrupt: false },
  PostToolBatch: { session_id: "s", hook_event_name: "PostToolBatch", tool_calls: [{ tool_name: "Read", tool_input: { file_path: "/secret" }, tool_use_id: "toolu_4", tool_response: "secret file" }] },
  Stop: { session_id: "s", hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "secret reply", background_tasks: [] },
  StopFailure: { session_id: "s", hook_event_name: "StopFailure", error: "rate_limit", error_details: "429", last_assistant_message: "API Error" },
};
test("hooks forward only bounded structured identifiers, never prompts, tool content, transcripts or assistant text", () => {
  const hooks = json("hooks/hooks.json").hooks as Record<string, NativeHookGroup[]>;
  expect(Object.keys(hooks).sort()).toEqual(Object.keys(events).sort());
  const forwarded = new Set<string>();
  for (const [name, groups] of Object.entries(hooks)) for (const group of groups) for (const hook of group.hooks) {
    expect(hook.timeout).toBeGreaterThan(0); expect(hook.timeout).toBeLessThanOrEqual(10);
    if (hook.type === "command") {
      expect(name).toBe("SessionStart"); expect(hook).toMatchObject({ command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/claude.mjs", "session-start"] });
      continue;
    }
    expect(hook).toMatchObject({ type: "mcp_tool", server: CLAUDE_HOOK_SERVER, tool: CLAUDE_LIFECYCLE_TOOL });
    for (const template of Object.values(hook.input ?? {})) for (const [, path] of String(template).matchAll(/\$\{([^}]*)\}/g)) forwarded.add(path!);
    const rendered = renderHookInput(hook.input, events[name]!);
    expect(JSON.stringify(rendered)).not.toContain("secret");
    expect(() => parseLifecycle(rendered)).not.toThrow();
  }
  expect([...forwarded].sort()).toEqual(["agent_id", "prompt_id", "session_id", "source", "tool_use_id"]);
  const pre = hooks.PreToolUse!;
  expect(pre).toHaveLength(1); expect(matcherSelects(pre[0]!.matcher, CLAUDE_FOCUS_TOOL_ID)).toBe(true);
  for (const other of ["Bash", "mcp__plugin_wolfpack-agent-context_focus__lifecycle", "mcp__plugin_wolfpack-agent-context_focus__update_focus_x", "xmcp__plugin_wolfpack-agent-context_focus__update_focus"]) expect(matcherSelects(pre[0]!.matcher, other)).toBe(false);
  for (const name of ["PostToolUse", "PostToolUseFailure"]) expect(matcherSelects(hooks[name]![0]!.matcher, "AnyTool")).toBe(true);
});

test("SessionStart routes MCP lifecycle hooks only to in-session sources; every source keeps the guidance command", () => {
  // Native contract (hooks reference "Events that fire before MCP servers are available"): launch-time SessionStart,
  // including --continue/--resume (and --fork-session), has no MCP client; /clear and compaction later do.
  const groups = json("hooks/hooks.json").hooks.SessionStart as NativeHookGroup[];
  const selected = (source: string) => groups.filter(group => matcherSelects(group.matcher, source)).flatMap(group => group.hooks.map(hook => hook.type));
  for (const source of ["startup", "resume", "fork"]) expect(selected(source)).toEqual(["command"]);
  for (const source of ["clear", "compact"]) expect(selected(source).sort()).toEqual(["command", "mcp_tool"]);
});

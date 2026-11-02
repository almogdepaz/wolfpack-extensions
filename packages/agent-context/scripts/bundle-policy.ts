import ts from "typescript";
import { isBuiltin } from "node:module";

/** Inspect module syntax without executing the bundle or consulting ambient controls. */
export function assertSelfContained(bundle: Uint8Array): void {
  const source = ts.createSourceFile("ui.js", Buffer.from(bundle).toString("utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const parseDiagnostics = (source as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (parseDiagnostics.length) throw new Error(`PACKAGE_GATE: bundle parse error: ${parseDiagnostics[0]?.messageText}`);
  const forbidden: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier || ts.isImportEqualsDeclaration(node)) forbidden.push("static module import/export");
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) forbidden.push("dynamic import/require");
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (forbidden.length) throw new Error(`PACKAGE_GATE: bundle contains external dependency syntax: ${[...new Set(forbidden)].join(", ")}`);
}

/** The server companion may import only Node builtins and the two declared Pi-provided peers. */
export function assertPiBundle(bundle: Uint8Array): void {
  const source = ts.createSourceFile("pi.js", Buffer.from(bundle).toString("utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const seen = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const name = node.moduleSpecifier.text; seen.add(name);
      if (!isBuiltin(name) && name !== "typebox" && name !== "@earendil-works/pi-coding-agent") throw new Error(`PACKAGE_GATE: unexpected Pi companion import ${name}`);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) throw new Error("PACKAGE_GATE: unexpected dynamic Pi companion dependency");
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!seen.has("typebox") || !seen.has("@earendil-works/pi-coding-agent")) throw new Error("PACKAGE_GATE: Pi-provided peers must remain external");
}

/** The Claude plugin server is fully bundled: only Node builtins may remain as imports. */
export function assertClaudeBundle(bundle: Uint8Array): void {
  const source = ts.createSourceFile("claude.mjs", Buffer.from(bundle).toString("utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const parseDiagnostics = (source as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (parseDiagnostics.length) throw new Error(`PACKAGE_GATE: Claude bundle parse error: ${parseDiagnostics[0]?.messageText}`);
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !isBuiltin(node.moduleSpecifier.text)) throw new Error(`PACKAGE_GATE: unexpected Claude server import ${node.moduleSpecifier.text}`);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && /^(require|__require)$/.test(node.expression.text))) throw new Error("PACKAGE_GATE: unexpected dynamic Claude server dependency");
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const HOOK_SERVER = "plugin:wolfpack-agent-context:focus", FOCUS_TOOL_ID = "mcp__plugin_wolfpack-agent-context_focus__update_focus";
const SERVER_ARGS = ["${CLAUDE_PLUGIN_ROOT}/dist/claude.mjs"];
// Only bounded native identifiers may be forwarded; prompts, tool input/output, transcripts and assistant text never are.
const FORWARDED_FIELDS = new Set(["session_id", "prompt_id", "tool_use_id", "agent_id", "source"]);
const SESSION_START_MCP_SOURCES = "clear|compact";
const EXPECTED_EVENTS = ["PostToolBatch", "PostToolUse", "PostToolUseFailure", "PreToolUse", "SessionStart", "Stop", "StopFailure", "UserPromptSubmit"];
/** Shipped Claude plugin manifests: exact scoped server, bounded hooks, no raw-content forwarding. */
export function assertClaudePlugin(plugin: any, hooksFile: any): void {
  const fail = (message: string): never => { throw new Error(`PACKAGE_GATE: CLAUDE_PLUGIN ${message}`); };
  if (plugin?.name !== "wolfpack-agent-context" || JSON.stringify(plugin.mcpServers) !== JSON.stringify({ focus: { command: "node", args: SERVER_ARGS } }) || plugin.hooks !== undefined) fail("manifest must declare exactly the bundled focus stdio server");
  const hooks = hooksFile?.hooks;
  if (!hooks || typeof hooks !== "object" || JSON.stringify(Object.keys(hooks).sort()) !== JSON.stringify(EXPECTED_EVENTS)) fail("hooks must cover exactly the reviewed lifecycle events");
  for (const [event, groups] of Object.entries(hooks as Record<string, any[]>)) {
    // SessionStart: the guidance command for every source; MCP hooks only for in-session sources, because launch
    // (startup, --continue/--resume, --fork-session) has no MCP client context.
    const expected: Array<{ matcher: string | undefined; type: string }> = event === "SessionStart"
      ? [{ matcher: undefined, type: "command" }, { matcher: SESSION_START_MCP_SOURCES, type: "mcp_tool" }]
      : [{ matcher: event === "PreToolUse" ? FOCUS_TOOL_ID : event.startsWith("PostToolUse") ? "*" : undefined, type: "mcp_tool" }];
    if (!Array.isArray(groups) || groups.length !== expected.length) fail(`${event} must have ${expected.length} matcher group(s)`);
    for (const [index, group] of groups.entries()) {
      const { matcher, type } = expected[index]!;
      if (group.matcher !== matcher) fail(`${event} matcher must be ${matcher ?? "absent"}`);
      if (!Array.isArray(group.hooks) || group.hooks.length !== 1 || group.hooks[0].type !== type) fail(`${event} group ${index} must hold one ${type} hook`);
      for (const hook of group.hooks ?? []) {
        if (!Number.isInteger(hook.timeout) || hook.timeout < 1 || hook.timeout > 10) fail(`${event} hooks need a bounded timeout`);
        if (hook.type === "command") {
          if (event !== "SessionStart" || hook.command !== "node" || JSON.stringify(hook.args) !== JSON.stringify([...SERVER_ARGS, "session-start"]) || Object.keys(hook).sort().join() !== "args,command,timeout,type") fail("only the SessionStart guidance command is allowed");
          continue;
        }
        if (hook.type !== "mcp_tool" || hook.server !== HOOK_SERVER || hook.tool !== "lifecycle" || Object.keys(hook).sort().join() !== "input,server,timeout,tool,type") fail(`${event} hooks must call only the scoped lifecycle tool`);
        for (const [key, value] of Object.entries(hook.input ?? {})) {
          if (typeof value !== "string") fail(`${event}.${key} must be a string template`);
          for (const [, path] of (value as string).matchAll(/\$\{([^}]*)\}/g)) if (!FORWARDED_FIELDS.has(path!) || `\${${path}}` !== value) fail(`${event}.${key} forwards a non-identifier field`);
        }
      }
    }
  }
}

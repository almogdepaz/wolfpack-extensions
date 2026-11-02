/**
 * Claude Code 2.1.316 mcp_tool hook input rendering, as observed in the installed binary
 * (hooks reference "MCP tool hook fields"): only string values are templated; each `${a.b}` path
 * resolves through objects, null/undefined become "", objects become JSON and other values String().
 * This is the native contract our hooks.json relies on, not plugin production logic.
 */
export function renderHookInput(input: unknown, event: Record<string, unknown>): unknown {
  const lookup = (path: string): unknown => {
    let value: unknown = event;
    for (const key of path.split(".")) { if (value === null || value === undefined || typeof value !== "object") return undefined; value = (value as Record<string, unknown>)[key]; }
    return value;
  };
  const render = (value: unknown): unknown => {
    if (typeof value === "string") return value.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, (_match, path: string) => {
      const resolved = lookup(path);
      if (resolved === undefined || resolved === null) return "";
      return typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved);
    });
    if (Array.isArray(value)) return value.map(render);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, render(item)]));
    return value;
  };
  return render(input);
}
export interface NativeHook { readonly type: string; readonly server?: string; readonly tool?: string; readonly input?: Record<string, unknown>; readonly command?: string; readonly args?: readonly string[]; readonly timeout?: number }
export interface NativeHookGroup { readonly matcher?: string; readonly hooks: readonly NativeHook[] }
/** Native matcher semantics for the subset we ship: omitted/"*" match all; exact-name characters compare exactly. */
export function matcherSelects(matcher: string | undefined, value: string): boolean {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (/^[A-Za-z0-9_\- ,|]+$/.test(matcher)) return matcher.split(/[|,]/).map(part => part.trim()).includes(value);
  return new RegExp(matcher).test(value);
}

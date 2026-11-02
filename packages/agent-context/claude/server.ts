import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CliTransport } from "../src/cli.ts";
import { CLAUDE_SERVER_KEY, CLAUDE_TOOLS, ClaudeFocusController, callTool, startupGuidance } from "../src/claude.ts";
import { FocusPublisher } from "../src/publisher.ts";

/**
 * Claude Code plugin stdio server. Hooks and model calls reach this one process per Claude session,
 * so lifecycle state is shared in memory; no IPC, daemon, heartbeat or observer model.
 */
if (process.argv[2] === "session-start") {
  // SessionStart at launch precedes MCP availability; plain stdout becomes model context. Only verified sessions get it.
  const guidance = await startupGuidance(new CliTransport("claude"), process.env.CLAUDE_PROJECT_DIR || undefined);
  if (guidance) process.stdout.write(`${guidance}\n`);
} else {
  const controller = new ClaudeFocusController(new FocusPublisher(new CliTransport("claude")), process.env.CLAUDE_PROJECT_DIR || undefined, message => {
    // Diagnostics go to stderr only: lifecycle failures must never inject model turns or loops.
    process.stderr.write(`[agent-context] Focus panel not synced: ${message}\n`);
  });
  // Low-level Server: tools advertise the reviewed JSON schema and the server owns validation, so
  // malformed snapshots reach the controller and are counted as failed maintenance.
  // Guidance comes from the SessionStart command (also re-run after /clear and compaction), not duplicated as server instructions.
  const server = new Server({ name: CLAUDE_SERVER_KEY, version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: CLAUDE_TOOLS.map(tool => ({ ...tool })) }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => callTool(controller, request.params.name, request.params.arguments, request.params._meta, extra.signal));
  await server.connect(new StdioServerTransport());
}

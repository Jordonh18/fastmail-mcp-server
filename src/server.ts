import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "./jmap/client.js";
import { registerMailboxTools } from "./tools/mailbox.js";
import { registerIdentityTools } from "./tools/identity.js";
import { registerEmailReadTools } from "./tools/email-read.js";
import { registerEmailWriteTools } from "./tools/email-write.js";
import { registerEmailManageTools } from "./tools/email-manage.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerSamplingTools } from "./tools/sampling.js";
import { registerDiagnosticsTools } from "./tools/diagnostics.js";
import { log } from "./logger.js";
import { recordToolCall } from "./web-ui.js";

export function createServer(): McpServer {
  log.info("Initializing Fastmail MCP server v1.2.0");

  const apiToken = process.env.FASTMAIL_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      "FASTMAIL_API_TOKEN environment variable is required. " +
        "Generate an API token at: Fastmail Settings → Privacy & Security → Manage API tokens",
    );
  }
  log.info("API token found (length: " + apiToken.length + " chars)");

  const client = new JmapClient({ apiToken });

  const server = new McpServer({
    name: "fastmail",
    version: "1.2.0",
  });

  // Wrap server.tool() to intercept handler invocations and feed the web-UI
  // tool-call log.  The callback is always the last argument regardless of
  // which overload is used (name+handler, name+desc+handler, name+desc+schema+handler).
  const origTool = server.tool.bind(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = (...args: any[]) => {
    const toolName = args[0] as string;
    const lastIdx = args.length - 1;
    const handler = args[lastIdx];
    if (typeof handler === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args[lastIdx] = async (...handlerArgs: any[]) => {
        try {
          const result = await handler(...handlerArgs);
          recordToolCall(toolName, handlerArgs[0], true);
          return result;
        } catch (err: unknown) {
          recordToolCall(toolName, handlerArgs[0], false, err);
          throw err;
        }
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origTool as any)(...args);
  };

  log.info("Registering tool groups...");
  registerMailboxTools(server, client);
  log.debug("  ✓ Mailbox tools registered");
  registerIdentityTools(server, client);
  log.debug("  ✓ Identity tools registered");
  registerEmailReadTools(server, client);
  log.debug("  ✓ Email read tools registered");
  registerEmailWriteTools(server, client);
  log.debug("  ✓ Email write tools registered");
  registerEmailManageTools(server, client);
  log.debug("  ✓ Email manage tools registered");
  registerCalendarTools(server, client);
  log.debug("  ✓ Calendar tools registered");
  registerContactTools(server, client);
  log.debug("  ✓ Contact tools registered");
  registerSamplingTools(server, client);
  log.debug("  ✓ Sampling tools registered");
  registerDiagnosticsTools(server, client);
  log.debug("  ✓ Diagnostics tools registered");
  log.info("All tool groups registered successfully");

  return server;
}

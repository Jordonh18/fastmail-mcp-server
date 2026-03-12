import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "./jmap/client.js";
import { registerMailboxTools } from "./tools/mailbox.js";
import { registerIdentityTools } from "./tools/identity.js";
import { registerEmailReadTools } from "./tools/email-read.js";
import { registerEmailWriteTools } from "./tools/email-write.js";
import { registerEmailManageTools } from "./tools/email-manage.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerContactTools } from "./tools/contacts.js";

export function createServer(): McpServer {
  const apiToken = process.env.FASTMAIL_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      "FASTMAIL_API_TOKEN environment variable is required. " +
        "Generate an API token at: Fastmail Settings → Privacy & Security → Manage API tokens",
    );
  }

  const client = new JmapClient({ apiToken });

  const server = new McpServer({
    name: "fastmail",
    version: "1.0.0",
  });

  registerMailboxTools(server, client);
  registerIdentityTools(server, client);
  registerEmailReadTools(server, client);
  registerEmailWriteTools(server, client);
  registerEmailManageTools(server, client);
  registerCalendarTools(server, client);
  registerContactTools(server, client);

  return server;
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { identityGet } from "../jmap/methods.js";
import { Identity } from "../jmap/types.js";
import { log } from "../logger.js";

export function registerIdentityTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "get_identities",
    "List all sender identities (email addresses) available for sending emails",
    {},
    async () => {
      log.tool("get_identities", "invoked");
      const accountId = await client.getAccountId();
      const response = await client.request([identityGet(accountId)]);

      const [, data] = response.methodResponses[0];
      const identities = (data.list as Identity[]) ?? [];

      if (identities.length === 0) {
        log.tool("get_identities", "completed", { count: 0 });
        return { content: [{ type: "text", text: "No sender identities found." }] };
      }

      const lines = identities.map((id) => {
        const name = id.name ? `${id.name} ` : "";
        const replyTo =
          id.replyTo && id.replyTo.length > 0
            ? ` (reply-to: ${id.replyTo.map((r) => r.email).join(", ")})`
            : "";
        return `${name}<${id.email}>${replyTo} [id: ${id.id}]`;
      });

      log.tool("get_identities", "completed", { count: identities.length });
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  );
}

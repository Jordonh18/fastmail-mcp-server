import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import { mailboxGet, mailboxSet } from "../jmap/methods.js";
import { Mailbox } from "../jmap/types.js";

export function registerMailboxTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "list_mailboxes",
    "List all mailboxes (folders) in the Fastmail account with their roles, email counts, and IDs",
    {},
    async () => {
      const accountId = await client.getAccountId();
      const response = await client.request([mailboxGet(accountId)]);

      const [, data] = response.methodResponses[0];
      const mailboxes = (data.list as Mailbox[]) ?? [];

      if (mailboxes.length === 0) {
        return { content: [{ type: "text", text: "No mailboxes found." }] };
      }

      // Build hierarchy map for display
      const byId = new Map(mailboxes.map((m) => [m.id, m]));
      const lines: string[] = [];

      // Sort: role-based mailboxes first, then alphabetical
      const sorted = [...mailboxes].sort((a, b) => {
        if (a.role && !b.role) return -1;
        if (!a.role && b.role) return 1;
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      });

      for (const mb of sorted) {
        const indent = mb.parentId ? "  " : "";
        const role = mb.role ? ` (${mb.role})` : "";
        const unread = mb.unreadEmails > 0 ? `, ${mb.unreadEmails} unread` : "";
        const parent = mb.parentId ? ` [parent: ${byId.get(mb.parentId)?.name ?? mb.parentId}]` : "";
        lines.push(
          `${indent}${mb.name}${role} — ${mb.totalEmails} emails${unread}${parent} [id: ${mb.id}]`,
        );
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "create_mailbox",
    "Create a new mailbox (folder) in the Fastmail account",
    {
      name: z.string().describe("Name for the new mailbox/folder"),
      parentId: z
        .string()
        .optional()
        .describe("Parent mailbox ID for creating a nested folder. Omit for top-level."),
    },
    async ({ name, parentId }) => {
      const accountId = await client.getAccountId();
      const createData: { name: string; parentId?: string | null } = { name };
      if (parentId) {
        createData.parentId = parentId;
      }

      const response = await client.request([
        mailboxSet(accountId, { create: { new: createData } }),
      ]);

      const [, data] = response.methodResponses[0];
      const created = data.created as Record<string, { id: string }> | undefined;

      if (!created?.new) {
        const notCreated = data.notCreated as Record<string, { type: string; description?: string }> | undefined;
        const error = notCreated?.new;
        throw new Error(
          `Failed to create mailbox: ${error?.description ?? error?.type ?? "Unknown error"}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Mailbox "${name}" created successfully [id: ${created.new.id}]`,
          },
        ],
      };
    },
  );
}

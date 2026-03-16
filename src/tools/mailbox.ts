import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import { mailboxGet, mailboxSet } from "../jmap/methods.js";
import { Mailbox } from "../jmap/types.js";
import { log } from "../logger.js";

export function registerMailboxTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "list_mailboxes",
    "List all mailboxes (folders) in the Fastmail account with their roles, email counts, and IDs",
    {},
    async () => {
      log.tool("list_mailboxes", "invoked");
      const accountId = await client.getAccountId();
      const response = await client.request([mailboxGet(accountId)]);

      const [, data] = response.methodResponses[0];
      const mailboxes = (data.list as Mailbox[]) ?? [];

      if (mailboxes.length === 0) {
        log.tool("list_mailboxes", "completed", { count: 0 });
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

      log.tool("list_mailboxes", "completed", { count: mailboxes.length });
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "create_mailbox",
    "Create a new mailbox (folder) in the Fastmail account",
    {
      name: z.string().min(1).max(256).describe("Name for the new mailbox/folder"),
      parentId: z
        .string()
        .optional()
        .describe("Parent mailbox ID for creating a nested folder. Omit for top-level."),
    },
    async ({ name, parentId }) => {
      log.tool("create_mailbox", "invoked", { name, parentId });
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

      log.tool("create_mailbox", "completed", { id: created.new.id, name });
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

  server.tool(
    "rename_mailbox",
    "Rename an existing mailbox (folder). Use list_mailboxes to find the mailbox ID.",
    {
      mailboxId: z.string().describe("The mailbox ID to rename"),
      newName: z.string().min(1).max(256).describe("The new name for the mailbox"),
    },
    async ({ mailboxId, newName }) => {
      log.tool("rename_mailbox", "invoked", { mailboxId, newName });
      const accountId = await client.getAccountId();

      const response = await client.request([
        mailboxSet(accountId, {
          update: { [mailboxId]: { name: newName } },
        }),
      ]);

      const [, data] = response.methodResponses[0];
      const notUpdated = data.notUpdated as
        | Record<string, { type: string; description?: string }>
        | undefined;

      if (notUpdated?.[mailboxId]) {
        throw new Error(
          `Failed to rename mailbox: ${notUpdated[mailboxId].description ?? notUpdated[mailboxId].type}`,
        );
      }

      log.tool("rename_mailbox", "completed", { mailboxId, newName });
      return {
        content: [
          {
            type: "text",
            text: `Mailbox renamed to "${newName}" successfully.`,
          },
        ],
      };
    },
  );

  server.tool(
    "delete_mailbox",
    "Delete a mailbox (folder). The mailbox must be empty or you must set force=true to delete with all contents. System mailboxes (Inbox, Trash, etc.) cannot be deleted.",
    {
      mailboxId: z.string().describe("The mailbox ID to delete"),
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Set to true to delete the mailbox even if it contains emails (moves emails to Trash). Default: false (only delete if empty).",
        ),
    },
    async ({ mailboxId, force }) => {
      log.tool("delete_mailbox", "invoked", { mailboxId, force });
      const accountId = await client.getAccountId();

      const destroyOp: Record<string, unknown> = {};
      if (force) {
        destroyOp.onDestroyRemoveEmails = true;
      }

      const response = await client.request([
        mailboxSet(accountId, { destroy: [mailboxId], ...destroyOp }),
      ]);

      const [, data] = response.methodResponses[0];
      const notDestroyed = data.notDestroyed as
        | Record<string, { type: string; description?: string }>
        | undefined;

      if (notDestroyed?.[mailboxId]) {
        throw new Error(
          `Failed to delete mailbox: ${notDestroyed[mailboxId].description ?? notDestroyed[mailboxId].type}`,
        );
      }

      log.tool("delete_mailbox", "completed", { mailboxId });
      return {
        content: [
          {
            type: "text",
            text: `Mailbox ${mailboxId} deleted successfully.`,
          },
        ],
      };
    },
  );
}

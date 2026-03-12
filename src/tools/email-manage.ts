import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import { emailSet, mailboxGet } from "../jmap/methods.js";
import { Mailbox } from "../jmap/types.js";

let cachedTrashId: string | null = null;

async function getTrashMailboxId(client: JmapClient): Promise<string> {
  if (cachedTrashId) return cachedTrashId;
  const accountId = await client.getAccountId();
  const response = await client.request([mailboxGet(accountId)]);
  const [, data] = response.methodResponses[0];
  const mailboxes = (data.list as Mailbox[]) ?? [];
  const trash = mailboxes.find((m) => m.role === "trash");
  if (!trash) throw new Error("Could not find Trash mailbox.");
  cachedTrashId = trash.id;
  return cachedTrashId;
}

export function registerEmailManageTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "move_email",
    "Move an email to a different mailbox (folder). Use list_mailboxes to find mailbox IDs.",
    {
      emailId: z.string().describe("The email ID to move"),
      mailboxId: z.string().describe("The destination mailbox ID"),
    },
    async ({ emailId, mailboxId }) => {
      const accountId = await client.getAccountId();

      await client.request([
        emailSet(accountId, {
          update: {
            [emailId]: { mailboxIds: { [mailboxId]: true } },
          },
        }),
      ]);

      return {
        content: [
          {
            type: "text",
            text: `Email ${emailId} moved to mailbox ${mailboxId}`,
          },
        ],
      };
    },
  );

  server.tool(
    "update_email_flags",
    "Update email flags (read/unread status, flagged/unflagged status)",
    {
      emailId: z.string().describe("The email ID to update"),
      isRead: z
        .boolean()
        .optional()
        .describe("Set to true to mark as read, false to mark as unread"),
      isFlagged: z
        .boolean()
        .optional()
        .describe("Set to true to flag/star, false to unflag/unstar"),
    },
    async ({ emailId, isRead, isFlagged }) => {
      const accountId = await client.getAccountId();

      const patch: Record<string, unknown> = {};
      if (isRead !== undefined) {
        patch["keywords/$seen"] = isRead ? true : null;
      }
      if (isFlagged !== undefined) {
        patch["keywords/$flagged"] = isFlagged ? true : null;
      }

      if (Object.keys(patch).length === 0) {
        return {
          content: [{ type: "text", text: "No flag changes specified." }],
        };
      }

      await client.request([
        emailSet(accountId, {
          update: { [emailId]: patch },
        }),
      ]);

      const changes: string[] = [];
      if (isRead !== undefined) changes.push(isRead ? "marked as read" : "marked as unread");
      if (isFlagged !== undefined) changes.push(isFlagged ? "flagged" : "unflagged");

      return {
        content: [
          {
            type: "text",
            text: `Email ${emailId}: ${changes.join(", ")}`,
          },
        ],
      };
    },
  );

  server.tool(
    "delete_email",
    "Delete an email. By default moves to Trash. Set permanent=true to permanently destroy the email.",
    {
      emailId: z.string().describe("The email ID to delete"),
      permanent: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set to true to permanently delete (cannot be undone). Default: move to Trash."),
    },
    async ({ emailId, permanent }) => {
      const accountId = await client.getAccountId();

      if (permanent) {
        await client.request([
          emailSet(accountId, { destroy: [emailId] }),
        ]);
        return {
          content: [
            { type: "text", text: `Email ${emailId} permanently deleted.` },
          ],
        };
      }

      const trashId = await getTrashMailboxId(client);
      await client.request([
        emailSet(accountId, {
          update: { [emailId]: { mailboxIds: { [trashId]: true } } },
        }),
      ]);

      return {
        content: [
          { type: "text", text: `Email ${emailId} moved to Trash.` },
        ],
      };
    },
  );
}

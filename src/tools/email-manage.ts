import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import { emailQuery, emailSet, mailboxGet } from "../jmap/methods.js";
import { Mailbox } from "../jmap/types.js";

let cachedTrashId: string | null = null;
let cachedArchiveId: string | null = null;
let cachedMailboxes: Mailbox[] | null = null;

async function loadMailboxes(client: JmapClient): Promise<Mailbox[]> {
  if (cachedMailboxes) return cachedMailboxes;
  const accountId = await client.getAccountId();
  const response = await client.request([mailboxGet(accountId)]);
  const [, data] = response.methodResponses[0];
  cachedMailboxes = (data.list as Mailbox[]) ?? [];
  return cachedMailboxes;
}

async function getTrashMailboxId(client: JmapClient): Promise<string> {
  if (cachedTrashId) return cachedTrashId;
  const mailboxes = await loadMailboxes(client);
  const trash = mailboxes.find((m) => m.role === "trash");
  if (!trash) throw new Error("Could not find Trash mailbox.");
  cachedTrashId = trash.id;
  return cachedTrashId;
}

async function getArchiveMailboxId(client: JmapClient): Promise<string> {
  if (cachedArchiveId) return cachedArchiveId;
  const mailboxes = await loadMailboxes(client);
  const archive = mailboxes.find((m) => m.role === "archive");
  if (!archive) throw new Error("Could not find Archive mailbox. You may need to create one first.");
  cachedArchiveId = archive.id;
  return cachedArchiveId;
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

  server.tool(
    "bulk_email_action",
    "Perform an action on multiple emails at once. Supports marking as read/unread, flagging/unflagging, moving, and deleting.",
    {
      emailIds: z
        .array(z.string())
        .min(1)
        .describe("Array of email IDs to act on"),
      action: z
        .enum([
          "mark_read",
          "mark_unread",
          "flag",
          "unflag",
          "move",
          "delete",
          "permanent_delete",
        ])
        .describe(
          "Action to perform: mark_read, mark_unread, flag, unflag, move (requires mailboxId), delete (move to Trash), or permanent_delete",
        ),
      mailboxId: z
        .string()
        .optional()
        .describe("Destination mailbox ID (required when action is 'move')"),
    },
    async ({ emailIds, action, mailboxId }) => {
      const accountId = await client.getAccountId();

      if (action === "move" && !mailboxId) {
        throw new Error(
          "mailboxId is required when action is 'move'. Use list_mailboxes to find available mailbox IDs.",
        );
      }

      if (action === "permanent_delete") {
        await client.request([
          emailSet(accountId, { destroy: emailIds }),
        ]);
        return {
          content: [
            {
              type: "text",
              text: `${emailIds.length} email(s) permanently deleted.`,
            },
          ],
        };
      }

      if (action === "delete") {
        const trashId = await getTrashMailboxId(client);
        const update: Record<string, Record<string, unknown>> = {};
        for (const id of emailIds) {
          update[id] = { mailboxIds: { [trashId]: true } };
        }
        await client.request([
          emailSet(accountId, { update }),
        ]);
        return {
          content: [
            {
              type: "text",
              text: `${emailIds.length} email(s) moved to Trash.`,
            },
          ],
        };
      }

      if (action === "move") {
        const update: Record<string, Record<string, unknown>> = {};
        for (const id of emailIds) {
          update[id] = { mailboxIds: { [mailboxId!]: true } };
        }
        await client.request([
          emailSet(accountId, { update }),
        ]);
        return {
          content: [
            {
              type: "text",
              text: `${emailIds.length} email(s) moved to mailbox ${mailboxId}.`,
            },
          ],
        };
      }

      // Flag operations
      const patch: Record<string, unknown> = {};
      let description = "";
      switch (action) {
        case "mark_read":
          patch["keywords/$seen"] = true;
          description = "marked as read";
          break;
        case "mark_unread":
          patch["keywords/$seen"] = null;
          description = "marked as unread";
          break;
        case "flag":
          patch["keywords/$flagged"] = true;
          description = "flagged";
          break;
        case "unflag":
          patch["keywords/$flagged"] = null;
          description = "unflagged";
          break;
      }

      const update: Record<string, Record<string, unknown>> = {};
      for (const id of emailIds) {
        update[id] = patch;
      }

      await client.request([
        emailSet(accountId, { update }),
      ]);

      return {
        content: [
          {
            type: "text",
            text: `${emailIds.length} email(s) ${description}.`,
          },
        ],
      };
    },
  );

  server.tool(
    "archive_email",
    "Move one or more emails to the Archive mailbox. A convenient one-step operation for archiving emails you've dealt with.",
    {
      emailIds: z
        .union([z.string(), z.array(z.string())])
        .describe("A single email ID or array of email IDs to archive"),
    },
    async ({ emailIds: rawIds }) => {
      const accountId = await client.getAccountId();
      const archiveId = await getArchiveMailboxId(client);

      const emailIds = Array.isArray(rawIds) ? rawIds : [rawIds];

      const update: Record<string, Record<string, unknown>> = {};
      for (const id of emailIds) {
        update[id] = { mailboxIds: { [archiveId]: true } };
      }

      await client.request([
        emailSet(accountId, { update }),
      ]);

      return {
        content: [
          {
            type: "text",
            text: emailIds.length === 1
              ? `Email ${emailIds[0]} archived.`
              : `${emailIds.length} email(s) archived.`,
          },
        ],
      };
    },
  );

  server.tool(
    "mark_mailbox_read",
    "Mark all emails in a specific mailbox as read. Useful for clearing unread counts on a mailbox. Processes up to 500 unread emails at a time.",
    {
      mailboxId: z.string().describe("The mailbox ID whose emails should be marked as read (use list_mailboxes to find IDs)"),
    },
    async ({ mailboxId }) => {
      const accountId = await client.getAccountId();

      // Query all unread emails in the mailbox
      const filter: Record<string, unknown> = {
        operator: "AND",
        conditions: [
          { inMailbox: mailboxId },
          {
            operator: "NOT",
            conditions: [{ hasKeyword: "$seen" }],
          },
        ],
      };

      const response = await client.request([
        emailQuery(accountId, filter, { limit: 500 }, "mrq"),
      ]);

      const queryResponse = response.methodResponses.find(([name]) => name === "Email/query");
      if (!queryResponse) {
        return { content: [{ type: "text", text: "No unread emails found in this mailbox." }] };
      }

      const emailIds = (queryResponse[1].ids as string[]) ?? [];
      if (emailIds.length === 0) {
        return { content: [{ type: "text", text: "All emails in this mailbox are already read." }] };
      }

      // Mark all as read
      const update: Record<string, Record<string, unknown>> = {};
      for (const id of emailIds) {
        update[id] = { "keywords/$seen": true };
      }

      await client.request([
        emailSet(accountId, { update }),
      ]);

      return {
        content: [
          {
            type: "text",
            text: `${emailIds.length} email(s) marked as read.`,
          },
        ],
      };
    },
  );
}

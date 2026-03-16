import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import { emailQuery, emailSet, mailboxGet } from "../jmap/methods.js";
import { Mailbox, MethodCall } from "../jmap/types.js";
import { log } from "../logger.js";

let cachedTrashId: string | null = null;
let cachedArchiveId: string | null = null;
let cachedMailboxes: Mailbox[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BULK_EMAILS = 100;

function isCacheExpired(): boolean {
  return Date.now() - cacheTimestamp > CACHE_TTL_MS;
}

function invalidateCache(): void {
  cachedTrashId = null;
  cachedArchiveId = null;
  cachedMailboxes = null;
  cacheTimestamp = 0;
}

async function loadMailboxes(client: JmapClient): Promise<Mailbox[]> {
  if (cachedMailboxes && !isCacheExpired()) return cachedMailboxes;
  invalidateCache();
  const accountId = await client.getAccountId();
  const response = await client.request([mailboxGet(accountId)]);
  const [, data] = response.methodResponses[0];
  cachedMailboxes = (data.list as Mailbox[]) ?? [];
  cacheTimestamp = Date.now();
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

function buildMailboxPatch(
  mailboxIds: string[],
  enabled: boolean,
): Record<string, true | null> {
  const patch: Record<string, true | null> = {};
  for (const mailboxId of mailboxIds) {
    patch[`mailboxIds/${mailboxId}`] = enabled ? true : null;
  }
  return patch;
}

function formatMailboxStats(mailbox: Mailbox): string {
  const role = mailbox.role ? ` (${mailbox.role})` : "";
  return [
    `${mailbox.name}${role}`,
    `ID: ${mailbox.id}`,
    `Emails: ${mailbox.totalEmails}`,
    `Unread: ${mailbox.unreadEmails}`,
    `Threads: ${mailbox.totalThreads}`,
    `Unread threads: ${mailbox.unreadThreads}`,
  ].join("\n");
}

function getUnreadFilter(): Record<string, unknown> {
  return {
    operator: "NOT",
    conditions: [{ hasKeyword: "$seen" }],
  };
}

async function queryEmailTotal(
  client: JmapClient,
  filter: Record<string, unknown>,
  callId: string,
): Promise<number> {
  const accountId = await client.getAccountId();
  const queryCall: MethodCall = [
    "Email/query",
    {
      accountId,
      filter,
      sort: [{ property: "receivedAt", isAscending: false }],
      limit: 1,
      position: 0,
      collapseThreads: false,
      calculateTotal: true,
    },
    callId,
  ];

  const response = await client.request([queryCall]);
  const queryResponse = response.methodResponses.find(
    ([name, , responseCallId]) => name === "Email/query" && responseCallId === callId,
  );
  const data = queryResponse?.[1] as { total?: unknown; ids?: string[] } | undefined;

  if (typeof data?.total === "number") {
    return data.total;
  }

  return Array.isArray(data?.ids) ? data.ids.length : 0;
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
      log.tool("move_email", "invoked", { emailId, mailboxId });
      const accountId = await client.getAccountId();

      await client.request([
        emailSet(accountId, {
          update: {
            [emailId]: { mailboxIds: { [mailboxId]: true } },
          },
        }),
      ]);

      log.tool("move_email", "completed", { emailId, mailboxId });
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
    "add_labels",
    "Add one or more mailbox labels to an email without removing its existing mailbox assignments.",
    {
      emailId: z.string().describe("The email ID to label"),
      mailboxIds: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("Mailbox IDs to add as labels"),
    },
    async ({ emailId, mailboxIds }) => {
      log.tool("add_labels", "invoked", { emailId, mailboxIds });
      const accountId = await client.getAccountId();

      await client.request([
        emailSet(accountId, {
          update: {
            [emailId]: buildMailboxPatch(mailboxIds, true),
          },
        }),
      ]);

      log.tool("add_labels", "completed", { emailId, count: mailboxIds.length });
      return {
        content: [
          {
            type: "text",
            text: `${mailboxIds.length} label(s) added to email ${emailId}.`,
          },
        ],
      };
    },
  );

  server.tool(
    "remove_labels",
    "Remove one or more mailbox labels from an email while preserving any other mailbox assignments.",
    {
      emailId: z.string().describe("The email ID to update"),
      mailboxIds: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("Mailbox IDs to remove as labels"),
    },
    async ({ emailId, mailboxIds }) => {
      log.tool("remove_labels", "invoked", { emailId, mailboxIds });
      const accountId = await client.getAccountId();

      await client.request([
        emailSet(accountId, {
          update: {
            [emailId]: buildMailboxPatch(mailboxIds, false),
          },
        }),
      ]);

      log.tool("remove_labels", "completed", { emailId, count: mailboxIds.length });
      return {
        content: [
          {
            type: "text",
            text: `${mailboxIds.length} label(s) removed from email ${emailId}.`,
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
      log.tool("update_email_flags", "invoked", { emailId, isRead, isFlagged });
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

      log.tool("update_email_flags", "completed", { emailId, changes });
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
      log.tool("delete_email", "invoked", { emailId, permanent });
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
        .max(MAX_BULK_EMAILS)
        .describe(`Array of email IDs to act on (maximum ${MAX_BULK_EMAILS})`),
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
      log.tool("bulk_email_action", "invoked", { count: emailIds.length, action, mailboxId });
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
    "bulk_add_labels",
    "Add one or more mailbox labels to multiple emails at once while preserving their other mailbox assignments.",
    {
      emailIds: z
        .array(z.string())
        .min(1)
        .max(MAX_BULK_EMAILS)
        .describe(`Array of email IDs to label (maximum ${MAX_BULK_EMAILS})`),
      mailboxIds: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("Mailbox IDs to add as labels"),
    },
    async ({ emailIds, mailboxIds }) => {
      log.tool("bulk_add_labels", "invoked", { emailCount: emailIds.length, mailboxCount: mailboxIds.length });
      const accountId = await client.getAccountId();
      const patch = buildMailboxPatch(mailboxIds, true);
      const update: Record<string, Record<string, unknown>> = {};

      for (const emailId of emailIds) {
        update[emailId] = patch;
      }

      await client.request([
        emailSet(accountId, { update }),
      ]);

      log.tool("bulk_add_labels", "completed", { emailCount: emailIds.length, labelsAdded: mailboxIds.length });
      return {
        content: [
          {
            type: "text",
            text: `${mailboxIds.length} label(s) added across ${emailIds.length} email(s).`,
          },
        ],
      };
    },
  );

  server.tool(
    "bulk_remove_labels",
    "Remove one or more mailbox labels from multiple emails at once while preserving any other mailbox assignments.",
    {
      emailIds: z
        .array(z.string())
        .min(1)
        .max(MAX_BULK_EMAILS)
        .describe(`Array of email IDs to update (maximum ${MAX_BULK_EMAILS})`),
      mailboxIds: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("Mailbox IDs to remove as labels"),
    },
    async ({ emailIds, mailboxIds }) => {
      log.tool("bulk_remove_labels", "invoked", { emailCount: emailIds.length, mailboxCount: mailboxIds.length });
      const accountId = await client.getAccountId();
      const patch = buildMailboxPatch(mailboxIds, false);
      const update: Record<string, Record<string, unknown>> = {};

      for (const emailId of emailIds) {
        update[emailId] = patch;
      }

      await client.request([
        emailSet(accountId, { update }),
      ]);

      log.tool("bulk_remove_labels", "completed", { emailCount: emailIds.length, labelsRemoved: mailboxIds.length });
      return {
        content: [
          {
            type: "text",
            text: `${mailboxIds.length} label(s) removed across ${emailIds.length} email(s).`,
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
      log.tool("archive_email", "invoked", { emailIds: rawIds });
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

      log.tool("archive_email", "completed", { count: emailIds.length });
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
      log.tool("mark_mailbox_read", "invoked", { mailboxId });
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

      log.tool("mark_mailbox_read", "completed", { markedRead: emailIds.length });
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

  server.tool(
    "get_mailbox_stats",
    "Get compact mailbox statistics such as email counts, unread counts, and thread counts. Use this when you need an overview instead of listing mailbox contents.",
    {
      mailboxId: z
        .string()
        .optional()
        .describe("Mailbox ID to inspect. If omitted, returns stats for all mailboxes."),
    },
    async ({ mailboxId }) => {
      log.tool("get_mailbox_stats", "invoked", { mailboxId: mailboxId ?? "all" });
      const mailboxes = await loadMailboxes(client);

      if (mailboxes.length === 0) {
        return {
          content: [{ type: "text", text: "No mailboxes found." }],
        };
      }

      if (mailboxId) {
        const mailbox = mailboxes.find((item) => item.id === mailboxId);
        if (!mailbox) {
          throw new Error(`Mailbox not found: ${mailboxId}`);
        }

        return {
          content: [{ type: "text", text: formatMailboxStats(mailbox) }],
        };
      }

      const sorted = [...mailboxes].sort((a, b) => {
        if (a.role && !b.role) return -1;
        if (!a.role && b.role) return 1;
        return b.unreadEmails - a.unreadEmails || b.totalEmails - a.totalEmails || a.name.localeCompare(b.name);
      });

      return {
        content: [
          {
            type: "text",
            text: `Mailbox statistics (${sorted.length} total):\n\n${sorted.map(formatMailboxStats).join("\n\n")}`,
          },
        ],
      };
    },
  );

  server.tool(
    "get_account_summary",
    "Get a compact account-level summary with unique email totals, unread counts, mailbox counts, and top mailboxes. Prefer this over large list calls when you only need an overview.",
    {},
    async () => {
      log.tool("get_account_summary", "invoked");
      const mailboxes = await loadMailboxes(client);
      const totalEmails = await queryEmailTotal(client, {}, "account.summary.total");
      const unreadEmails = await queryEmailTotal(
        client,
        getUnreadFilter(),
        "account.summary.unread",
      );

      const systemMailboxes = mailboxes.filter((mailbox) => mailbox.role).length;
      const customMailboxes = mailboxes.length - systemMailboxes;
      const unreadMailboxes = mailboxes.filter((mailbox) => mailbox.unreadEmails > 0).length;
      const topUnread = [...mailboxes]
        .filter((mailbox) => mailbox.unreadEmails > 0)
        .sort((a, b) => b.unreadEmails - a.unreadEmails || b.totalEmails - a.totalEmails)
        .slice(0, 5);
      const topByVolume = [...mailboxes]
        .sort((a, b) => b.totalEmails - a.totalEmails || b.unreadEmails - a.unreadEmails)
        .slice(0, 5);

      const sections = [
        "Account summary",
        `Unique emails: ${totalEmails}`,
        `Unread emails: ${unreadEmails}`,
        `Mailboxes: ${mailboxes.length} total (${systemMailboxes} system, ${customMailboxes} custom)`,
        `Mailboxes with unread email: ${unreadMailboxes}`,
      ];

      if (topUnread.length > 0) {
        sections.push(
          "",
          "Top mailboxes by unread email:",
          ...topUnread.map(
            (mailbox, index) => `${index + 1}. ${mailbox.name} — ${mailbox.unreadEmails} unread / ${mailbox.totalEmails} total [id: ${mailbox.id}]`,
          ),
        );
      }

      sections.push(
        "",
        "Top mailboxes by volume:",
        ...topByVolume.map(
          (mailbox, index) => `${index + 1}. ${mailbox.name} — ${mailbox.totalEmails} total / ${mailbox.unreadEmails} unread [id: ${mailbox.id}]`,
        ),
        "",
        "Note: mailbox totals can overlap because Fastmail mailboxes may also act like labels. The unique email counts above come from account-wide Email/query calls.",
      );

      log.tool("get_account_summary", "completed", { mailboxCount: mailboxes.length, totalEmails, unreadEmails });
      return {
        content: [{ type: "text", text: sections.join("\n") }],
      };
    },
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import {
  emailQuery,
  emailGet,
  emailGetByQueryRef,
  threadGet,
} from "../jmap/methods.js";
import { Email, EmailAddress } from "../jmap/types.js";

const MAX_BODY_LENGTH = 50_000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

function formatAddress(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function formatAddressList(addrs: EmailAddress[] | null): string {
  if (!addrs || addrs.length === 0) return "";
  return addrs.map(formatAddress).join(", ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getEmailBody(email: Email): string {
  // Prefer text/plain
  if (email.textBody && email.textBody.length > 0) {
    const partId = email.textBody[0].partId;
    const body = email.bodyValues?.[partId];
    if (body) {
      const text = body.value;
      const suffix = body.isEncodingProblem ? "\n\n[Note: encoding issues detected]" : "";
      return text.length > MAX_BODY_LENGTH
        ? text.slice(0, MAX_BODY_LENGTH) + "\n\n[Content truncated]"
        : text + suffix;
    }
  }

  // Fall back to HTML stripped
  if (email.htmlBody && email.htmlBody.length > 0) {
    const partId = email.htmlBody[0].partId;
    const body = email.bodyValues?.[partId];
    if (body) {
      const text = stripHtml(body.value);
      return text.length > MAX_BODY_LENGTH
        ? text.slice(0, MAX_BODY_LENGTH) + "\n\n[Content truncated]"
        : text;
    }
  }

  return "[No body content available]";
}

function formatEmailSummary(email: Email, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : "";
  const from = formatAddressList(email.from) || "Unknown sender";
  const date = new Date(email.receivedAt).toLocaleString();
  const flags: string[] = [];
  if (!email.keywords?.["$seen"]) flags.push("UNREAD");
  if (email.keywords?.["$flagged"]) flags.push("FLAGGED");
  const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";

  return [
    `${prefix}${email.subject || "(no subject)"}${flagStr}`,
    `  From: ${from}`,
    `  Date: ${date}`,
    `  Preview: ${email.preview}`,
    `  [id: ${email.id}] [thread: ${email.threadId}]`,
  ].join("\n");
}

export function registerEmailReadTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "search_emails",
    "Search for emails using filters like sender, recipient, subject, date range, or full-text query. Use this tool when you need to find specific emails matching particular criteria. For simply checking recent emails, use get_latest_emails instead. For unread emails only, use get_unread_emails instead.",
    {
      mailboxId: z.string().optional().describe("Filter to a specific mailbox ID"),
      query: z.string().max(1000).optional().describe("Full-text search query"),
      from: z.string().max(500).optional().describe("Filter by sender email or name"),
      to: z.string().max(500).optional().describe("Filter by recipient email or name"),
      subject: z.string().max(998).optional().describe("Filter by subject text"),
      after: z.string().optional().describe("Only emails after this date (ISO 8601, e.g. 2024-01-15)"),
      before: z.string().optional().describe("Only emails before this date (ISO 8601, e.g. 2024-02-15)"),
      hasAttachment: z.boolean().optional().describe("Filter to emails with attachments (true) or without (false)"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of results (default 20, max 100)"),
    },
    async ({ mailboxId, query, from, to, subject, after, before, hasAttachment, limit }) => {
      const accountId = await client.getAccountId();

      const filter: Record<string, unknown> = {};
      if (mailboxId) filter.inMailbox = mailboxId;
      if (query) filter.text = query;
      if (from) filter.from = from;
      if (to) filter.to = to;
      if (subject) filter.subject = subject;
      if (after) filter.after = new Date(after).toISOString();
      if (before) filter.before = new Date(before).toISOString();
      if (hasAttachment !== undefined) filter.hasAttachment = hasAttachment;

      const cappedLimit = Math.min(limit, 100);
      const queryCallId = "q";

      const response = await client.request([
        emailQuery(accountId, filter, { limit: cappedLimit }, queryCallId),
        emailGetByQueryRef(queryCallId, undefined, "g"),
      ]);

      // Find the Email/get response
      const getResponse = response.methodResponses.find(([name]) => name === "Email/get");
      if (!getResponse) {
        return { content: [{ type: "text", text: "No results found." }] };
      }

      const emails = (getResponse[1].list as Email[]) ?? [];
      if (emails.length === 0) {
        return { content: [{ type: "text", text: "No emails match your search criteria." }] };
      }

      // Get total from query response
      const queryResponse = response.methodResponses.find(([name]) => name === "Email/query");
      const total = (queryResponse?.[1].total as number) ?? emails.length;

      const header = `Found ${total} email(s)${total > cappedLimit ? ` (showing first ${cappedLimit})` : ""}:\n`;
      const lines = emails.map((email, i) => formatEmailSummary(email, i));

      return {
        content: [{ type: "text", text: header + lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "get_email",
    "Get the full content of a specific email by its ID, including headers, body text, and attachment info",
    {
      emailId: z.string().describe("The email ID to retrieve"),
    },
    async ({ emailId }) => {
      const accountId = await client.getAccountId();
      const response = await client.request([
        emailGet(accountId, [emailId]),
      ]);

      const [, data] = response.methodResponses[0];
      const emails = (data.list as Email[]) ?? [];

      if (emails.length === 0) {
        throw new Error(`Email not found: ${emailId}`);
      }

      const email = emails[0];
      const sections: string[] = [];

      // Headers
      sections.push(`Subject: ${email.subject || "(no subject)"}`);
      sections.push(`From: ${formatAddressList(email.from) || "Unknown"}`);
      if (email.to) sections.push(`To: ${formatAddressList(email.to)}`);
      if (email.cc) sections.push(`CC: ${formatAddressList(email.cc)}`);
      if (email.bcc) sections.push(`BCC: ${formatAddressList(email.bcc)}`);
      sections.push(`Date: ${new Date(email.receivedAt).toLocaleString()}`);

      // Flags
      const flags: string[] = [];
      if (!email.keywords?.["$seen"]) flags.push("UNREAD");
      if (email.keywords?.["$flagged"]) flags.push("FLAGGED");
      if (email.keywords?.["$draft"]) flags.push("DRAFT");
      if (flags.length > 0) sections.push(`Flags: ${flags.join(", ")}`);

      sections.push(`Size: ${Math.round(email.size / 1024)} KB`);
      sections.push(`Thread ID: ${email.threadId}`);
      sections.push(`Email ID: ${email.id}`);

      // Body
      sections.push("\n--- Body ---\n");
      sections.push(getEmailBody(email));

      // Attachments
      if (email.attachments && email.attachments.length > 0) {
        sections.push("\n--- Attachments ---");
        for (const att of email.attachments) {
          const name = att.name || "unnamed";
          const size = att.size > 1024 ? `${Math.round(att.size / 1024)} KB` : `${att.size} bytes`;
          sections.push(`  ${name} (${att.type}, ${size}) [blobId: ${att.blobId}]`);
        }
      }

      return {
        content: [{ type: "text", text: sections.join("\n") }],
      };
    },
  );

  server.tool(
    "get_thread",
    "Get all emails in a conversation thread, showing the full discussion chronologically",
    {
      threadId: z.string().describe("The thread/conversation ID"),
    },
    async ({ threadId }) => {
      const accountId = await client.getAccountId();

      // First get the thread to find email IDs
      const threadResponse = await client.request([
        threadGet(accountId, [threadId]),
      ]);

      const [, threadData] = threadResponse.methodResponses[0];
      const threads = (threadData.list as { id: string; emailIds: string[] }[]) ?? [];

      if (threads.length === 0 || threads[0].emailIds.length === 0) {
        throw new Error(`Thread not found: ${threadId}`);
      }

      const emailIds = threads[0].emailIds;

      // Fetch all emails in the thread
      const emailResponse = await client.request([
        emailGet(accountId, emailIds, {
          properties: [
            "id", "from", "to", "cc", "subject", "receivedAt",
            "preview", "keywords", "bodyValues", "textBody", "htmlBody",
          ],
          fetchAllBodyValues: true,
        }),
      ]);

      const [, emailData] = emailResponse.methodResponses[0];
      const emails = (emailData.list as Email[]) ?? [];

      // Sort chronologically
      emails.sort(
        (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
      );

      const header = `Thread: ${emails[0]?.subject || "(no subject)"} (${emails.length} messages)\n`;
      const lines = emails.map((email, i) => {
        const from = formatAddressList(email.from) || "Unknown";
        const date = new Date(email.receivedAt).toLocaleString();
        const body = getEmailBody(email);
        return `--- Message ${i + 1} ---\nFrom: ${from}\nDate: ${date}\n\n${body}`;
      });

      return {
        content: [{ type: "text", text: header + "\n" + lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "get_unread_emails",
    "Retrieve unread emails, optionally filtered by mailbox. Best for checking what needs attention. Do not use search_emails for this purpose.",
    {
      mailboxId: z.string().optional().describe("Filter to a specific mailbox ID (e.g. Inbox). If omitted, returns unread emails from all mailboxes."),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of results (default 20, max 100)"),
    },
    async ({ mailboxId, limit }) => {
      const accountId = await client.getAccountId();

      const unreadFilter: Record<string, unknown> = {
        operator: "NOT",
        conditions: [{ hasKeyword: "$seen" }],
      };

      const combinedFilter: Record<string, unknown> = mailboxId
        ? {
            operator: "AND",
            conditions: [
              { inMailbox: mailboxId },
              unreadFilter,
            ],
          }
        : unreadFilter;

      const cappedLimit = Math.min(limit, 100);
      const queryCallId = "uq";

      const response = await client.request([
        emailQuery(accountId, combinedFilter, { limit: cappedLimit }, queryCallId),
        emailGetByQueryRef(queryCallId, undefined, "ug"),
      ]);

      const getResponse = response.methodResponses.find(([name]) => name === "Email/get");
      if (!getResponse) {
        return { content: [{ type: "text", text: "No unread emails found." }] };
      }

      const emails = (getResponse[1].list as Email[]) ?? [];
      if (emails.length === 0) {
        return { content: [{ type: "text", text: "No unread emails." }] };
      }

      const queryResponse = response.methodResponses.find(([name]) => name === "Email/query");
      const total = (queryResponse?.[1].total as number) ?? emails.length;

      const header = `${total} unread email(s)${total > cappedLimit ? ` (showing first ${cappedLimit})` : ""}:\n`;
      const lines = emails.map((email, i) => formatEmailSummary(email, i));

      return {
        content: [{ type: "text", text: header + lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "get_latest_emails",
    "Get the most recent emails sorted by date. Best for quickly checking recent activity without specific search criteria. Do not use search_emails for this purpose.",
    {
      mailboxId: z.string().optional().describe("Filter to a specific mailbox ID. If omitted, returns latest emails from all mailboxes."),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Number of recent emails to return (default 10, max 50)"),
    },
    async ({ mailboxId, limit }) => {
      const accountId = await client.getAccountId();

      const filter: Record<string, unknown> = {};
      if (mailboxId) filter.inMailbox = mailboxId;

      const cappedLimit = Math.min(limit, 50);
      const queryCallId = "lq";

      const response = await client.request([
        emailQuery(
          accountId,
          filter,
          {
            sort: [{ property: "receivedAt", isAscending: false }],
            limit: cappedLimit,
          },
          queryCallId,
        ),
        emailGetByQueryRef(queryCallId, undefined, "lg"),
      ]);

      const getResponse = response.methodResponses.find(([name]) => name === "Email/get");
      if (!getResponse) {
        return { content: [{ type: "text", text: "No emails found." }] };
      }

      const emails = (getResponse[1].list as Email[]) ?? [];
      if (emails.length === 0) {
        return { content: [{ type: "text", text: "No emails found." }] };
      }

      const header = `${emails.length} most recent email(s):\n`;
      const lines = emails.map((email, i) => formatEmailSummary(email, i));

      return {
        content: [{ type: "text", text: header + lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "get_mailbox_emails",
    "List emails in a specific mailbox with pagination support. Use this when browsing a folder's contents page by page. Use list_mailboxes first to find available mailbox IDs.",
    {
      mailboxId: z.string().describe("The mailbox ID to list emails from (use list_mailboxes to find IDs)"),
      page: z
        .number()
        .optional()
        .default(0)
        .describe("Page number starting from 0 (default 0). Each page contains 'limit' emails."),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Number of emails per page (default 20, max 100)"),
    },
    async ({ mailboxId, page, limit }) => {
      const accountId = await client.getAccountId();

      const cappedLimit = Math.min(limit, 100);
      const position = page * cappedLimit;
      const queryCallId = "mq";

      const response = await client.request([
        emailQuery(
          accountId,
          { inMailbox: mailboxId },
          {
            sort: [{ property: "receivedAt", isAscending: false }],
            limit: cappedLimit,
            position,
          },
          queryCallId,
        ),
        emailGetByQueryRef(queryCallId, undefined, "mg"),
      ]);

      const getResponse = response.methodResponses.find(([name]) => name === "Email/get");
      if (!getResponse) {
        return { content: [{ type: "text", text: "No emails found in this mailbox." }] };
      }

      const emails = (getResponse[1].list as Email[]) ?? [];
      if (emails.length === 0) {
        return { content: [{ type: "text", text: page > 0 ? "No more emails on this page." : "This mailbox is empty." }] };
      }

      const queryResponse = response.methodResponses.find(([name]) => name === "Email/query");
      const total = (queryResponse?.[1].total as number) ?? emails.length;
      const totalPages = Math.ceil(total / cappedLimit);

      const header = `Mailbox contents (page ${page + 1} of ${totalPages}, ${total} total email(s)):\n`;
      const lines = emails.map((email, i) => formatEmailSummary(email, position + i));

      return {
        content: [{ type: "text", text: header + lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "download_attachment",
    "Download an email attachment by its blob ID. Use get_email first to find attachment blob IDs. Returns text content directly for text files, or base64-encoded data for binary files. Maximum attachment size is 10 MB.",
    {
      blobId: z.string().describe("The blob ID of the attachment (from get_email attachment listing)"),
      name: z.string().optional().default("attachment").describe("Filename for the download"),
    },
    async ({ blobId, name }) => {
      const { content, contentType } = await client.downloadBlob(blobId, name);

      if (content.length > MAX_ATTACHMENT_SIZE) {
        return {
          content: [
            {
              type: "text",
              text: `Attachment "${name}" (${contentType}, ${Math.round(content.length / 1024 / 1024)} MB) exceeds the 10 MB size limit and cannot be downloaded through this tool.`,
            },
          ],
        };
      }

      const isText = contentType.startsWith("text/") ||
        contentType === "application/json" ||
        contentType === "application/xml";

      if (isText) {
        const text = content.toString("utf-8");
        const truncated = text.length > MAX_BODY_LENGTH
          ? text.slice(0, MAX_BODY_LENGTH) + "\n\n[Content truncated]"
          : text;
        return {
          content: [{ type: "text", text: `Attachment: ${name} (${contentType})\n\n${truncated}` }],
        };
      }

      const isImage = contentType.startsWith("image/");

      if (isImage) {
        return {
          content: [
            {
              type: "text",
              text: `Attachment: ${name} (${contentType}, ${content.length} bytes)`,
            },
            {
              type: "image" as const,
              data: content.toString("base64"),
              mimeType: contentType,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Attachment: ${name} (${contentType}, ${content.length} bytes)\n\nBase64 content:\n${content.toString("base64")}`,
          },
        ],
      };
    },
  );
}

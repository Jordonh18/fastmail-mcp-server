import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import {
  emailGet,
  emailSet,
  emailSubmissionSet,
  identityGet,
  mailboxGet,
} from "../jmap/methods.js";
import { Email, EmailAddress, Identity, Mailbox } from "../jmap/types.js";

let cachedIdentities: Identity[] | null = null;
let cachedMailboxes: Map<string, Mailbox> | null = null;
let identityCacheTimestamp = 0;
let mailboxCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getIdentities(client: JmapClient): Promise<Identity[]> {
  if (cachedIdentities && Date.now() - identityCacheTimestamp < CACHE_TTL_MS) return cachedIdentities;
  cachedIdentities = null;
  const accountId = await client.getAccountId();
  const response = await client.request([identityGet(accountId)]);
  const [, data] = response.methodResponses[0];
  cachedIdentities = (data.list as Identity[]) ?? [];
  identityCacheTimestamp = Date.now();
  return cachedIdentities;
}

async function getMailboxByRole(client: JmapClient, role: string): Promise<Mailbox | undefined> {
  if (!cachedMailboxes || Date.now() - mailboxCacheTimestamp >= CACHE_TTL_MS) {
    cachedMailboxes = null;
    const accountId = await client.getAccountId();
    const response = await client.request([mailboxGet(accountId)]);
    const [, data] = response.methodResponses[0];
    const mailboxes = (data.list as Mailbox[]) ?? [];
    cachedMailboxes = new Map(mailboxes.map((m) => [m.id, m]));
    mailboxCacheTimestamp = Date.now();
  }
  for (const mb of cachedMailboxes.values()) {
    if (mb.role === role) return mb;
  }
  return undefined;
}

async function resolveIdentity(
  client: JmapClient,
  identityId?: string,
  matchEmail?: string,
): Promise<Identity> {
  const identities = await getIdentities(client);
  if (identities.length === 0) {
    throw new Error("No sender identities found. Cannot send email.");
  }

  if (identityId) {
    const identity = identities.find((i) => i.id === identityId);
    if (!identity) throw new Error(`Identity not found: ${identityId}`);
    return identity;
  }

  // Try to match by email address (useful for replies)
  if (matchEmail) {
    const match = identities.find(
      (i) => i.email.toLowerCase() === matchEmail.toLowerCase(),
    );
    if (match) return match;
  }

  return identities[0];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAddresses(addresses: string[]): EmailAddress[] {
  return addresses.map((addr) => {
    const match = addr.match(/^(.+?)\s*<(.+)>$/);
    const email = match ? match[2].trim() : addr.trim();
    if (!EMAIL_REGEX.test(email)) {
      throw new Error(`Invalid email address format: "${email}"`);
    }
    if (match) {
      return { name: match[1].trim(), email };
    }
    return { name: null, email };
  });
}

function formatAddress(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

export function registerEmailWriteTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "send_email",
    "Compose and send a new email. Use get_identities first to find available sender identities.",
    {
      to: z.array(z.string()).min(1).max(100).describe("Recipient email addresses (max 100)"),
      cc: z.array(z.string()).max(100).optional().describe("CC recipient email addresses (max 100)"),
      bcc: z.array(z.string()).max(100).optional().describe("BCC recipient email addresses (max 100)"),
      subject: z.string().max(998).describe("Email subject line"),
      body: z.string().max(1_000_000).describe("Email body text (plain text, max 1 MB)"),
      identityId: z
        .string()
        .optional()
        .describe("Sender identity ID from get_identities. Uses default if omitted."),
    },
    async ({ to, cc, bcc, subject, body, identityId }) => {
      const accountId = await client.getAccountId();
      const identity = await resolveIdentity(client, identityId);
      const draftsMailbox = await getMailboxByRole(client, "drafts");
      const sentMailbox = await getMailboxByRole(client, "sent");

      if (!draftsMailbox) {
        throw new Error("Could not find Drafts mailbox.");
      }

      const emailCreate: Record<string, unknown> = {
        mailboxIds: { [draftsMailbox.id]: true },
        from: [{ name: identity.name, email: identity.email }],
        to: parseAddresses(to),
        subject,
        bodyValues: { body: { value: body, charset: "utf-8" } },
        textBody: [{ partId: "body", type: "text/plain" }],
        keywords: { $draft: true },
      };

      if (cc) emailCreate.cc = parseAddresses(cc);
      if (bcc) emailCreate.bcc = parseAddresses(bcc);

      const onSuccessUpdate: Record<string, unknown> = {
        "keywords/$draft": null,
      };
      if (sentMailbox) {
        onSuccessUpdate[`mailboxIds/${draftsMailbox.id}`] = null;
        onSuccessUpdate[`mailboxIds/${sentMailbox.id}`] = true;
      }

      const response = await client.request([
        emailSet(accountId, { create: { draft: emailCreate } }),
        emailSubmissionSet(
          accountId,
          { send: { identityId: identity.id, emailId: "#draft" } },
          { onSuccessUpdateEmail: { "#send": onSuccessUpdate } },
        ),
      ]);

      // Check for submission errors
      const submissionResponse = response.methodResponses.find(
        ([name]) => name === "EmailSubmission/set",
      );
      if (submissionResponse) {
        const [, subData] = submissionResponse;
        const notCreated = subData.notCreated as Record<string, { type: string; description?: string }> | undefined;
        if (notCreated?.send) {
          throw new Error(
            `Failed to send email: ${notCreated.send.description ?? notCreated.send.type}`,
          );
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Email sent successfully to ${to.join(", ")}`,
          },
        ],
      };
    },
  );

  server.tool(
    "reply_email",
    "Reply to an existing email. Automatically sets threading headers (In-Reply-To, References) and determines recipients.",
    {
      emailId: z.string().describe("ID of the email to reply to"),
      body: z.string().describe("Reply body text (plain text)"),
      replyAll: z
        .boolean()
        .optional()
        .default(false)
        .describe("Reply to all recipients (default: reply only to sender)"),
      identityId: z
        .string()
        .optional()
        .describe("Sender identity ID. Auto-detected if omitted."),
    },
    async ({ emailId, body, replyAll, identityId }) => {
      const accountId = await client.getAccountId();

      // Fetch original email
      const origResponse = await client.request([
        emailGet(accountId, [emailId]),
      ]);
      const [, origData] = origResponse.methodResponses[0];
      const origEmails = (origData.list as Email[]) ?? [];
      if (origEmails.length === 0) {
        throw new Error(`Original email not found: ${emailId}`);
      }
      const original = origEmails[0];

      // Resolve identity — try to match against To/CC of original
      const myAddresses = original.to
        ?.map((a) => a.email)
        .concat(original.cc?.map((a) => a.email) ?? []);
      const matchAddr = myAddresses?.[0];
      const identity = await resolveIdentity(client, identityId, matchAddr);

      // Build reply recipients
      let replyTo: EmailAddress[];
      let replyCc: EmailAddress[] | undefined;

      if (replyAll) {
        // Reply-all: original from + original to + original cc, excluding self
        const allRecipients = [
          ...(original.from ?? []),
          ...(original.to ?? []),
          ...(original.cc ?? []),
        ].filter((a) => a.email.toLowerCase() !== identity.email.toLowerCase());

        replyTo = allRecipients.length > 0 ? [allRecipients[0]] : original.from ?? [];
        replyCc = allRecipients.slice(1);
        if (replyCc.length === 0) replyCc = undefined;
      } else {
        replyTo = original.from ?? [];
      }

      // Build subject
      const subject = original.subject.match(/^re:/i)
        ? original.subject
        : `Re: ${original.subject}`;

      // Build threading headers
      const inReplyTo = original.messageId ?? [];
      const references = [
        ...(original.references ?? []),
        ...(original.messageId ?? []),
      ];

      const draftsMailbox = await getMailboxByRole(client, "drafts");
      const sentMailbox = await getMailboxByRole(client, "sent");
      if (!draftsMailbox) throw new Error("Could not find Drafts mailbox.");

      const emailCreate: Record<string, unknown> = {
        mailboxIds: { [draftsMailbox.id]: true },
        from: [{ name: identity.name, email: identity.email }],
        to: replyTo,
        subject,
        inReplyTo,
        references,
        bodyValues: { body: { value: body, charset: "utf-8" } },
        textBody: [{ partId: "body", type: "text/plain" }],
        keywords: { $draft: true },
      };

      if (replyCc) emailCreate.cc = replyCc;

      const onSuccessUpdate: Record<string, unknown> = {
        "keywords/$draft": null,
      };
      if (sentMailbox) {
        onSuccessUpdate[`mailboxIds/${draftsMailbox.id}`] = null;
        onSuccessUpdate[`mailboxIds/${sentMailbox.id}`] = true;
      }

      const response = await client.request([
        emailSet(accountId, { create: { draft: emailCreate } }),
        emailSubmissionSet(
          accountId,
          { send: { identityId: identity.id, emailId: "#draft" } },
          { onSuccessUpdateEmail: { "#send": onSuccessUpdate } },
        ),
      ]);

      const submissionResponse = response.methodResponses.find(
        ([name]) => name === "EmailSubmission/set",
      );
      if (submissionResponse) {
        const [, subData] = submissionResponse;
        const notCreated = subData.notCreated as Record<string, { type: string; description?: string }> | undefined;
        if (notCreated?.send) {
          throw new Error(
            `Failed to send reply: ${notCreated.send.description ?? notCreated.send.type}`,
          );
        }
      }

      const recipientList = replyTo.map(formatAddress).join(", ");
      return {
        content: [
          {
            type: "text",
            text: `Reply sent successfully to ${recipientList}`,
          },
        ],
      };
    },
  );

  server.tool(
    "forward_email",
    "Forward an existing email to new recipients with an optional message",
    {
      emailId: z.string().describe("ID of the email to forward"),
      to: z.array(z.string()).min(1).max(100).describe("Recipient email addresses to forward to (max 100)"),
      body: z
        .string()
        .optional()
        .describe("Optional message to include above the forwarded content"),
      identityId: z
        .string()
        .optional()
        .describe("Sender identity ID. Uses default if omitted."),
    },
    async ({ emailId, to, body: message, identityId }) => {
      const accountId = await client.getAccountId();

      // Fetch original email
      const origResponse = await client.request([
        emailGet(accountId, [emailId]),
      ]);
      const [, origData] = origResponse.methodResponses[0];
      const origEmails = (origData.list as Email[]) ?? [];
      if (origEmails.length === 0) {
        throw new Error(`Original email not found: ${emailId}`);
      }
      const original = origEmails[0];

      const identity = await resolveIdentity(client, identityId);

      // Build forwarded body
      const origFrom = original.from?.map(formatAddress).join(", ") ?? "Unknown";
      const origTo = original.to?.map(formatAddress).join(", ") ?? "";
      const origDate = new Date(original.receivedAt).toLocaleString();

      // Get original body text
      let origBody = "";
      if (original.textBody?.length && original.bodyValues) {
        const partId = original.textBody[0].partId;
        origBody = original.bodyValues[partId]?.value ?? original.preview;
      } else if (original.htmlBody?.length && original.bodyValues) {
        const partId = original.htmlBody[0].partId;
        const html = original.bodyValues[partId]?.value ?? "";
        origBody = html
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
      } else {
        origBody = original.preview;
      }

      const forwardedContent = [
        message ?? "",
        "",
        "---------- Forwarded message ----------",
        `From: ${origFrom}`,
        `Date: ${origDate}`,
        `Subject: ${original.subject}`,
        `To: ${origTo}`,
        "",
        origBody,
      ]
        .join("\n")
        .trim();

      const subject = original.subject.match(/^fwd:/i)
        ? original.subject
        : `Fwd: ${original.subject}`;

      const draftsMailbox = await getMailboxByRole(client, "drafts");
      const sentMailbox = await getMailboxByRole(client, "sent");
      if (!draftsMailbox) throw new Error("Could not find Drafts mailbox.");

      const emailCreate: Record<string, unknown> = {
        mailboxIds: { [draftsMailbox.id]: true },
        from: [{ name: identity.name, email: identity.email }],
        to: parseAddresses(to),
        subject,
        bodyValues: { body: { value: forwardedContent, charset: "utf-8" } },
        textBody: [{ partId: "body", type: "text/plain" }],
        keywords: { $draft: true },
      };

      const onSuccessUpdate: Record<string, unknown> = {
        "keywords/$draft": null,
      };
      if (sentMailbox) {
        onSuccessUpdate[`mailboxIds/${draftsMailbox.id}`] = null;
        onSuccessUpdate[`mailboxIds/${sentMailbox.id}`] = true;
      }

      const response = await client.request([
        emailSet(accountId, { create: { draft: emailCreate } }),
        emailSubmissionSet(
          accountId,
          { send: { identityId: identity.id, emailId: "#draft" } },
          { onSuccessUpdateEmail: { "#send": onSuccessUpdate } },
        ),
      ]);

      const submissionResponse = response.methodResponses.find(
        ([name]) => name === "EmailSubmission/set",
      );
      if (submissionResponse) {
        const [, subData] = submissionResponse;
        const notCreated = subData.notCreated as Record<string, { type: string; description?: string }> | undefined;
        if (notCreated?.send) {
          throw new Error(
            `Failed to forward email: ${notCreated.send.description ?? notCreated.send.type}`,
          );
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Email forwarded successfully to ${to.join(", ")}`,
          },
        ],
      };
    },
  );

  server.tool(
    "create_draft",
    "Save an email as a draft without sending. The draft can be edited or sent later using send_draft.",
    {
      to: z.array(z.string()).min(1).max(100).describe("Recipient email addresses (max 100)"),
      cc: z.array(z.string()).max(100).optional().describe("CC recipient email addresses (max 100)"),
      bcc: z.array(z.string()).max(100).optional().describe("BCC recipient email addresses (max 100)"),
      subject: z.string().max(998).describe("Email subject line"),
      body: z.string().max(1_000_000).describe("Email body text (plain text, max 1 MB)"),
      identityId: z
        .string()
        .optional()
        .describe("Sender identity ID from get_identities. Uses default if omitted."),
    },
    async ({ to, cc, bcc, subject, body, identityId }) => {
      const accountId = await client.getAccountId();
      const identity = await resolveIdentity(client, identityId);
      const draftsMailbox = await getMailboxByRole(client, "drafts");

      if (!draftsMailbox) {
        throw new Error("Could not find Drafts mailbox.");
      }

      const emailCreate: Record<string, unknown> = {
        mailboxIds: { [draftsMailbox.id]: true },
        from: [{ name: identity.name, email: identity.email }],
        to: parseAddresses(to),
        subject,
        bodyValues: { body: { value: body, charset: "utf-8" } },
        textBody: [{ partId: "body", type: "text/plain" }],
        keywords: { $draft: true },
      };

      if (cc) emailCreate.cc = parseAddresses(cc);
      if (bcc) emailCreate.bcc = parseAddresses(bcc);

      const response = await client.request([
        emailSet(accountId, { create: { draft: emailCreate } }),
      ]);

      const [, data] = response.methodResponses[0];
      const created = data.created as Record<string, { id: string }> | undefined;

      if (!created?.draft) {
        const notCreated = data.notCreated as Record<string, { type: string; description?: string }> | undefined;
        const error = notCreated?.draft;
        throw new Error(
          `Failed to create draft: ${error?.description ?? error?.type ?? "Unknown error"}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Draft saved successfully [id: ${created.draft.id}]`,
          },
        ],
      };
    },
  );

  server.tool(
    "send_draft",
    "Send a previously saved draft email. The draft must already exist in the Drafts mailbox.",
    {
      emailId: z.string().describe("The ID of the draft email to send"),
      identityId: z
        .string()
        .optional()
        .describe("Sender identity ID. Auto-detected from draft if omitted."),
    },
    async ({ emailId, identityId }) => {
      const accountId = await client.getAccountId();

      // Fetch the draft to get sender info
      const draftResponse = await client.request([
        emailGet(accountId, [emailId]),
      ]);
      const [, draftData] = draftResponse.methodResponses[0];
      const drafts = (draftData.list as Email[]) ?? [];

      if (drafts.length === 0) {
        throw new Error(`Draft not found: ${emailId}`);
      }

      const draft = drafts[0];

      // Verify it's actually a draft
      if (!draft.keywords?.["$draft"]) {
        throw new Error("This email is not a draft. Only draft emails can be sent with this tool.");
      }

      // Resolve identity from draft's from address
      const fromEmail = draft.from?.[0]?.email;
      const identity = await resolveIdentity(client, identityId, fromEmail);

      const sentMailbox = await getMailboxByRole(client, "sent");

      // Submit the draft for sending
      const onSuccessUpdate: Record<string, unknown> = {
        "keywords/$draft": null,
      };
      if (sentMailbox) {
        // Move from current mailbox to sent
        const currentMailboxIds = Object.keys(draft.mailboxIds || {});
        for (const mbId of currentMailboxIds) {
          onSuccessUpdate[`mailboxIds/${mbId}`] = null;
        }
        onSuccessUpdate[`mailboxIds/${sentMailbox.id}`] = true;
      }

      const response = await client.request([
        emailSubmissionSet(
          accountId,
          { send: { identityId: identity.id, emailId } },
          { onSuccessUpdateEmail: { "#send": onSuccessUpdate } },
        ),
      ]);

      const submissionResponse = response.methodResponses.find(
        ([name]) => name === "EmailSubmission/set",
      );
      if (submissionResponse) {
        const [, subData] = submissionResponse;
        const notCreated = subData.notCreated as Record<string, { type: string; description?: string }> | undefined;
        if (notCreated?.send) {
          throw new Error(
            `Failed to send draft: ${notCreated.send.description ?? notCreated.send.type}`,
          );
        }
      }

      const recipients = [
        ...(draft.to?.map(formatAddress) ?? []),
        ...(draft.cc?.map(formatAddress) ?? []),
      ];

      return {
        content: [
          {
            type: "text",
            text: `Draft sent successfully to ${recipients.join(", ") || "recipients"}`,
          },
        ],
      };
    },
  );
}

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

async function getIdentities(client: JmapClient): Promise<Identity[]> {
  if (cachedIdentities) return cachedIdentities;
  const accountId = await client.getAccountId();
  const response = await client.request([identityGet(accountId)]);
  const [, data] = response.methodResponses[0];
  cachedIdentities = (data.list as Identity[]) ?? [];
  return cachedIdentities;
}

async function getMailboxByRole(client: JmapClient, role: string): Promise<Mailbox | undefined> {
  if (!cachedMailboxes) {
    const accountId = await client.getAccountId();
    const response = await client.request([mailboxGet(accountId)]);
    const [, data] = response.methodResponses[0];
    const mailboxes = (data.list as Mailbox[]) ?? [];
    cachedMailboxes = new Map(mailboxes.map((m) => [m.id, m]));
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

function parseAddresses(addresses: string[]): EmailAddress[] {
  return addresses.map((addr) => {
    const match = addr.match(/^(.+?)\s*<(.+)>$/);
    if (match) {
      return { name: match[1].trim(), email: match[2].trim() };
    }
    return { name: null, email: addr.trim() };
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
      to: z.array(z.string()).describe("Recipient email addresses"),
      cc: z.array(z.string()).optional().describe("CC recipient email addresses"),
      bcc: z.array(z.string()).optional().describe("BCC recipient email addresses"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body text (plain text)"),
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
      to: z.array(z.string()).describe("Recipient email addresses to forward to"),
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
}

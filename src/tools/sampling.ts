import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import { emailGet } from "../jmap/methods.js";
import { Email } from "../jmap/types.js";
import { formatAddressList, getEmailBody } from "./email-helpers.js";

async function fetchEmail(client: JmapClient, emailId: string): Promise<Email> {
  const accountId = await client.getAccountId();
  const response = await client.request([emailGet(accountId, [emailId])]);
  const [, data] = response.methodResponses[0];
  const emails = (data.list as Email[]) ?? [];
  if (emails.length === 0) {
    throw new Error(`Email not found: ${emailId}`);
  }
  return emails[0];
}

export function registerSamplingTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "summarize_email",
    "Use the connected LLM to produce a concise summary of an email's subject, sender, and body. Requires the MCP client to support sampling.",
    {
      emailId: z.string().describe("The email ID to summarize (use search_emails or get_latest_emails to find IDs)"),
    },
    async ({ emailId }) => {
      const caps = server.server.getClientCapabilities();
      if (!caps?.sampling) {
        return {
          content: [
            {
              type: "text",
              text: "Sampling is not supported by the connected MCP client. Cannot summarize email via LLM.",
            },
          ],
        };
      }

      const email = await fetchEmail(client, emailId);

      const from = formatAddressList(email.from) || "Unknown sender";
      const subject = email.subject || "(no subject)";
      const date = new Date(email.receivedAt).toLocaleString();
      const body = getEmailBody(email);

      const emailText = `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${body}`;

      const result = await server.server.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please provide a concise 2-4 sentence summary of the following email, highlighting the key points and any required actions:\n\n${emailText}`,
            },
          },
        ],
        maxTokens: 300,
        systemPrompt:
          "You are a helpful email assistant. Summarize emails clearly and concisely, focusing on the main message and any action items.",
      });

      const summary =
        result.content.type === "text"
          ? result.content.text
          : "Unable to generate summary.";

      return {
        content: [
          {
            type: "text",
            text: `Summary of "${subject}":\n\n${summary}`,
          },
        ],
      };
    },
  );

  server.tool(
    "suggest_reply",
    "Use the connected LLM to draft a reply to an email based on the provided intent or instructions. Requires the MCP client to support sampling.",
    {
      emailId: z.string().describe("The email ID to reply to (use search_emails or get_latest_emails to find IDs)"),
      intent: z
        .string()
        .max(2000)
        .describe(
          "Describe what the reply should convey, e.g. 'Accept the meeting invitation' or 'Politely decline and suggest next week instead'",
        ),
    },
    async ({ emailId, intent }) => {
      const caps = server.server.getClientCapabilities();
      if (!caps?.sampling) {
        return {
          content: [
            {
              type: "text",
              text: "Sampling is not supported by the connected MCP client. Cannot draft a reply via LLM.",
            },
          ],
        };
      }

      const email = await fetchEmail(client, emailId);

      const from = formatAddressList(email.from) || "Unknown sender";
      const subject = email.subject || "(no subject)";
      const date = new Date(email.receivedAt).toLocaleString();
      const body = getEmailBody(email);

      const emailText = `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${body}`;

      const result = await server.server.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Original email:\n\n${emailText}\n\n---\n\nPlease draft a reply to this email. Intent: ${intent}`,
            },
          },
        ],
        maxTokens: 500,
        systemPrompt:
          "You are a helpful email assistant. Draft clear, professional email replies based on the user's intent. Output only the reply body text without subject lines or greeting headers.",
      });

      const draft =
        result.content.type === "text"
          ? result.content.text
          : "Unable to generate reply draft.";

      return {
        content: [
          {
            type: "text",
            text: `Suggested reply to "${subject}":\n\n${draft}`,
          },
        ],
      };
    },
  );
}

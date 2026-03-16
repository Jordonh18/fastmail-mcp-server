import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { log } from "../logger.js";
import { JMAP_CAPABILITIES } from "../jmap/types.js";

const MAILBOX_TOOLS = [
  "list_mailboxes",
  "create_mailbox",
  "rename_mailbox",
  "delete_mailbox",
];

const EMAIL_READ_TOOLS = [
  "search_emails",
  "get_email",
  "get_thread",
  "get_unread_emails",
  "get_latest_emails",
  "get_mailbox_emails",
  "get_email_attachments",
  "download_attachment",
];

const EMAIL_WRITE_TOOLS = [
  "send_email",
  "reply_email",
  "forward_email",
  "create_draft",
  "send_draft",
];

const EMAIL_MANAGE_TOOLS = [
  "move_email",
  "add_labels",
  "remove_labels",
  "update_email_flags",
  "delete_email",
  "bulk_email_action",
  "bulk_add_labels",
  "bulk_remove_labels",
  "archive_email",
  "mark_mailbox_read",
  "get_mailbox_stats",
  "get_account_summary",
];

const IDENTITY_TOOLS = ["get_identities"];
const CONTACT_TOOLS = [
  "list_address_books",
  "search_contacts",
  "get_contact",
  "create_contact",
  "update_contact",
  "delete_contact",
];

const CALENDAR_TOOLS = [
  "list_calendars",
  "get_calendar_events",
  "get_calendar_event",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
];

const SAMPLING_TOOLS = ["summarize_email", "suggest_reply"];
const DIAGNOSTIC_TOOLS = ["check_function_availability"];

function formatGroup(
  title: string,
  available: boolean,
  tools: string[],
  options?: { capability?: string | null; note?: string },
): string {
  const lines = [`${title}: ${available ? "available" : "unavailable"}`];

  if (options?.capability) {
    lines.push(`Capability: ${options.capability}`);
  }

  lines.push(`Tools (${tools.length}): ${tools.join(", ")}`);

  if (options?.note) {
    lines.push(`Note: ${options.note}`);
  }

  return lines.join("\n");
}

export function registerDiagnosticsTools(
  server: McpServer,
  client: JmapClient,
): void {
  server.tool(
    "check_function_availability",
    "Check which major Fastmail feature groups are available for this account and MCP client, including setup guidance for missing mail, submission, contacts, calendars, or sampling support.",
    {},
    async () => {
      log.tool("check_function_availability", "invoked");
      const session = await client.getSession();
      const hasMail = await client.hasCapability(JMAP_CAPABILITIES.MAIL);
      const hasSubmission = await client.hasCapability(
        JMAP_CAPABILITIES.SUBMISSION,
      );
      const calendarCapability = await client.getCalendarCapability();
      const contactsCapability = await client.getContactsCapability();
      const clientCapabilities = server.server.getClientCapabilities();
      const hasSampling = !!clientCapabilities?.sampling;
      const sessionCapabilities = Object.keys(session.capabilities ?? {});
      const totalTools = [
        ...MAILBOX_TOOLS,
        ...EMAIL_READ_TOOLS,
        ...EMAIL_WRITE_TOOLS,
        ...EMAIL_MANAGE_TOOLS,
        ...IDENTITY_TOOLS,
        ...CONTACT_TOOLS,
        ...CALENDAR_TOOLS,
        ...SAMPLING_TOOLS,
        ...DIAGNOSTIC_TOOLS,
      ].length;

      const sections = [
        "Fastmail capability report",
        `Registered tools in this server: ${totalTools}`,
        "",
        formatGroup(
          "Mail and mailbox access",
          hasMail,
          [...MAILBOX_TOOLS, ...EMAIL_READ_TOOLS, ...EMAIL_MANAGE_TOOLS],
          {
            capability: hasMail ? JMAP_CAPABILITIES.MAIL : null,
            note: hasMail
              ? "Core email access is configured."
              : "Mail access is required for almost all tools. Verify your API token has JMAP mail scope.",
          },
        ),
        "",
        formatGroup(
          "Sending and identities",
          hasSubmission,
          [...IDENTITY_TOOLS, ...EMAIL_WRITE_TOOLS],
          {
            capability: hasSubmission ? JMAP_CAPABILITIES.SUBMISSION : null,
            note: hasSubmission
              ? "Sending tools and identity lookup are available."
              : "If sending tools fail, verify the token includes mail submission access and that your account has at least one sending identity.",
          },
        ),
        "",
        formatGroup("Contacts", !!contactsCapability, CONTACT_TOOLS, {
          capability: contactsCapability,
          note: contactsCapability
            ? "Contacts capability is available."
            : "If contacts are unavailable, check your Fastmail plan and ensure the API token includes Contacts access.",
        }),
        "",
        formatGroup("Calendars", !!calendarCapability, CALENDAR_TOOLS, {
          capability: calendarCapability,
          note: calendarCapability
            ? "Calendar capability is available."
            : "If calendars are unavailable, check your Fastmail plan and ensure the API token includes Calendar access.",
        }),
        "",
        formatGroup("Sampling", hasSampling, SAMPLING_TOOLS, {
          note: hasSampling
            ? "The connected MCP client supports sampling-based tools."
            : "Sampling depends on the connected MCP client, not Fastmail. Use a client with MCP sampling support to enable summarize_email and suggest_reply.",
        }),
      ];

      if (sessionCapabilities.length > 0) {
        sections.push(
          "",
          "Session capability URIs:",
          ...sessionCapabilities.map((capability) => `- ${capability}`),
        );
      }

      log.tool("check_function_availability", "completed", { totalTools, capabilities: sessionCapabilities.length });
      return {
        content: [{ type: "text", text: sections.join("\n") }],
      };
    },
  );
}
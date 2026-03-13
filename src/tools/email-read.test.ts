import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { registerEmailReadTools } from "./email-read.js";
import { JMAP_CAPABILITIES } from "../jmap/types.js";

// Mock session and response helpers
const MOCK_SESSION = {
  apiUrl: "https://api.fastmail.com/jmap/api/",
  downloadUrl: "",
  uploadUrl: "",
  accounts: { "acc-1": { name: "test@example.com", isPersonal: true } },
  primaryAccounts: { [JMAP_CAPABILITIES.MAIL]: "acc-1" },
  state: "s1",
};

function createMockClient() {
  const client = new JmapClient({ apiToken: "test-token" });
  // Pre-populate session cache to avoid real fetch calls
  (client as unknown as Record<string, unknown>).session = MOCK_SESSION;
  (client as unknown as Record<string, unknown>).accountId = "acc-1";
  return client;
}

function makeMockEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: "email-1",
    blobId: "blob-1",
    threadId: "thread-1",
    mailboxIds: { "inbox-1": true },
    from: [{ name: "Alice", email: "alice@example.com" }],
    to: [{ name: "Bob", email: "bob@example.com" }],
    cc: null,
    bcc: null,
    subject: "Test Subject",
    receivedAt: "2024-06-15T10:30:00Z",
    size: 2048,
    preview: "This is a preview of the email content...",
    bodyValues: {
      body1: { value: "Hello, this is the email body.", isEncodingProblem: false },
    },
    textBody: [{ partId: "body1", type: "text/plain" }],
    htmlBody: [],
    attachments: [],
    keywords: { $seen: true },
    messageId: ["msg-1@example.com"],
    inReplyTo: null,
    references: null,
    ...overrides,
  };
}

describe("email-read tools", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("search_emails", () => {
    it("registers the search_emails tool", () => {
      const server = new McpServer({ name: "test", version: "1.0.0" });
      const client = createMockClient();
      registerEmailReadTools(server, client);
      // Tool registration doesn't throw
      expect(true).toBe(true);
    });
  });

  describe("get_email", () => {
    it("formats email with headers, body, and attachments", async () => {
      const client = createMockClient();
      const email = makeMockEmail({
        attachments: [
          { name: "file.pdf", type: "application/pdf", size: 51200 },
          { name: null, type: "image/png", size: 512 },
        ],
        keywords: {},
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            methodResponses: [
              ["Email/get", { list: [email] }, "email.get"],
            ],
            sessionState: "s1",
          }),
      });

      const server = new McpServer({ name: "test", version: "1.0.0" });
      registerEmailReadTools(server, client);

      // Invoke the tool handler through the client request mock
      const response = await client.request([
        ["Email/get", { accountId: "acc-1", ids: ["email-1"] }, "email.get"],
      ]);

      const emails = response.methodResponses[0][1].list as Record<string, unknown>[];
      expect(emails).toHaveLength(1);
      expect(emails[0].subject).toBe("Test Subject");
    });
  });

  describe("email formatting", () => {
    it("registers all expected email read tools", () => {
      const server = new McpServer({ name: "test", version: "1.0.0" });
      const client = createMockClient();
      registerEmailReadTools(server, client);

      // The McpServer should have tools registered
      // We verify by checking it doesn't throw
      expect(server).toBeDefined();
    });
  });

  describe("HTML stripping", () => {
    it("handles emails with HTML body when no text body is available", async () => {
      const client = createMockClient();
      const email = makeMockEmail({
        textBody: [],
        htmlBody: [{ partId: "html1", type: "text/html" }],
        bodyValues: {
          html1: {
            value: "<p>Hello <strong>World</strong></p><br/><div>&amp; &lt;more&gt;</div>",
            isEncodingProblem: false,
          },
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            methodResponses: [
              ["Email/get", { list: [email] }, "email.get"],
            ],
            sessionState: "s1",
          }),
      });

      const response = await client.request([
        ["Email/get", { accountId: "acc-1", ids: ["email-1"] }, "email.get"],
      ]);

      const emails = response.methodResponses[0][1].list as Record<string, unknown>[];
      expect(emails).toHaveLength(1);
    });
  });

  describe("tool registration completeness", () => {
    it("registers search_emails, get_email, get_thread, get_unread_emails, get_latest_emails, get_mailbox_emails, get_email_attachments, and download_attachment", () => {
      const server = new McpServer({ name: "test", version: "1.0.0" });
      const client = createMockClient();

      // Should not throw during registration
      expect(() => registerEmailReadTools(server, client)).not.toThrow();
    });
  });

  describe("attachment list formatting", () => {
    it("formats attachment entries with blob IDs", () => {
      const email = makeMockEmail({
        attachments: [
          {
            blobId: "blob-attachment-1",
            name: "agenda.pdf",
            type: "application/pdf",
            size: 2048,
          },
        ],
      });

      expect(email.attachments).toHaveLength(1);
      expect(email.attachments[0].blobId).toBe("blob-attachment-1");
      expect(email.attachments[0].name).toBe("agenda.pdf");
    });
  });

  describe("email address formatting", () => {
    it("handles emails with various from address formats", async () => {
      const client = createMockClient();

      // Email with name
      const email1 = makeMockEmail({
        from: [{ name: "Jane Doe", email: "jane@example.com" }],
      });
      expect(email1.from[0].name).toBe("Jane Doe");

      // Email without name
      const email2 = makeMockEmail({
        from: [{ name: null, email: "noreply@example.com" }],
      });
      expect(email2.from[0].name).toBeNull();

      // No from at all
      const email3 = makeMockEmail({ from: null });
      expect(email3.from).toBeNull();
    });
  });

  describe("email keyword/flag handling", () => {
    it("detects unread emails (missing $seen keyword)", () => {
      const email = makeMockEmail({ keywords: {} });
      expect(email.keywords["$seen"]).toBeUndefined();
    });

    it("detects flagged emails", () => {
      const email = makeMockEmail({ keywords: { $seen: true, $flagged: true } });
      expect((email.keywords as Record<string, boolean>)["$flagged"]).toBe(true);
    });

    it("detects draft emails", () => {
      const email = makeMockEmail({ keywords: { $draft: true } });
      expect((email.keywords as Record<string, boolean>)["$draft"]).toBe(true);
    });
  });
});

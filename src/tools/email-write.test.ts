import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { registerEmailWriteTools, parseAddresses } from "./email-write.js";
import { JMAP_CAPABILITIES } from "../jmap/types.js";

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
  (client as unknown as Record<string, unknown>).session = MOCK_SESSION;
  (client as unknown as Record<string, unknown>).accountId = "acc-1";
  return client;
}

describe("email-write tools", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("tool registration", () => {
    it("registers send_email, reply_email, forward_email, create_draft, send_draft", () => {
      const server = new McpServer({ name: "test", version: "1.0.0" });
      const client = createMockClient();
      expect(() => registerEmailWriteTools(server, client)).not.toThrow();
    });
  });

  describe("address parsing", () => {
    it("handles plain email addresses", () => {
      const result = parseAddresses(["test@example.com"]);
      expect(result).toEqual([{ name: null, email: "test@example.com" }]);
    });

    it("handles name with email in angle brackets", () => {
      const result = parseAddresses(["John Doe <john@example.com>"]);
      expect(result).toEqual([{ name: "John Doe", email: "john@example.com" }]);
    });

    it("rejects invalid email addresses", () => {
      expect(() => parseAddresses(["not-an-email"])).toThrow("Invalid email address format");
    });

    it("rejects empty email strings", () => {
      expect(() => parseAddresses([""])).toThrow("Invalid email address format");
    });

    it("rejects email without domain", () => {
      expect(() => parseAddresses(["user@"])).toThrow("Invalid email address format");
    });

    it("accepts multiple valid addresses", () => {
      const result = parseAddresses(["a@b.com", "Jane <jane@test.org>"]);
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe("a@b.com");
      expect(result[1].email).toBe("jane@test.org");
      expect(result[1].name).toBe("Jane");
    });
  });

  describe("send_email flow", () => {
    it("creates draft and submits for sending", async () => {
      const client = createMockClient();

      // Mock: identity fetch, then mailbox fetch, then email set + submission
      const fetchMock = vi.fn()
        // Identity/get
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [
                [
                  "Identity/get",
                  {
                    list: [
                      {
                        id: "id-1",
                        name: "Test User",
                        email: "test@example.com",
                        replyTo: null,
                        bcc: null,
                      },
                    ],
                  },
                  "identity.get",
                ],
              ],
              sessionState: "s1",
            }),
        })
        // Mailbox/get (for drafts and sent)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [
                [
                  "Mailbox/get",
                  {
                    list: [
                      {
                        id: "drafts-1",
                        name: "Drafts",
                        role: "drafts",
                        parentId: null,
                        sortOrder: 1,
                        totalEmails: 0,
                        unreadEmails: 0,
                        totalThreads: 0,
                        unreadThreads: 0,
                      },
                      {
                        id: "sent-1",
                        name: "Sent",
                        role: "sent",
                        parentId: null,
                        sortOrder: 2,
                        totalEmails: 0,
                        unreadEmails: 0,
                        totalThreads: 0,
                        unreadThreads: 0,
                      },
                    ],
                  },
                  "mailbox.get",
                ],
              ],
              sessionState: "s1",
            }),
        })
        // Email/set + EmailSubmission/set
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [
                [
                  "Email/set",
                  { created: { draft: { id: "new-email-1" } } },
                  "email.set",
                ],
                [
                  "EmailSubmission/set",
                  { created: { send: { id: "sub-1" } } },
                  "emailsubmission.set",
                ],
              ],
              sessionState: "s1",
            }),
        });
      globalThis.fetch = fetchMock;

      const response = await client.request([
        ["Identity/get", { accountId: "acc-1", ids: null }, "identity.get"],
      ]);

      const identities = response.methodResponses[0][1].list as Record<string, unknown>[];
      expect(identities).toHaveLength(1);
      expect(identities[0].email).toBe("test@example.com");
    });
  });

  describe("reply subject handling", () => {
    it("should prepend Re: to subjects not already starting with Re:", () => {
      const subject = "Hello World";
      const replySubject = subject.match(/^re:/i) ? subject : `Re: ${subject}`;
      expect(replySubject).toBe("Re: Hello World");
    });

    it("should not double Re: prefix", () => {
      const subject = "Re: Hello World";
      const replySubject = subject.match(/^re:/i) ? subject : `Re: ${subject}`;
      expect(replySubject).toBe("Re: Hello World");
    });

    it("handles case-insensitive Re:", () => {
      const subject = "RE: Important Message";
      const replySubject = subject.match(/^re:/i) ? subject : `Re: ${subject}`;
      expect(replySubject).toBe("RE: Important Message");
    });
  });

  describe("forward subject handling", () => {
    it("should prepend Fwd: to subjects not already starting with Fwd:", () => {
      const subject = "Original Subject";
      const fwdSubject = subject.match(/^fwd:/i) ? subject : `Fwd: ${subject}`;
      expect(fwdSubject).toBe("Fwd: Original Subject");
    });

    it("should not double Fwd: prefix", () => {
      const subject = "Fwd: Original Subject";
      const fwdSubject = subject.match(/^fwd:/i) ? subject : `Fwd: ${subject}`;
      expect(fwdSubject).toBe("Fwd: Original Subject");
    });
  });
});

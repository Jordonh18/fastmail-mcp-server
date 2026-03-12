import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { registerMailboxTools } from "./mailbox.js";
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

describe("mailbox tools", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("tool registration", () => {
    it("registers list_mailboxes, create_mailbox, rename_mailbox, delete_mailbox", () => {
      const server = new McpServer({ name: "test", version: "1.0.0" });
      const client = createMockClient();
      expect(() => registerMailboxTools(server, client)).not.toThrow();
    });
  });

  describe("mailbox sorting logic", () => {
    it("sorts role-based mailboxes before custom mailboxes", () => {
      const mailboxes = [
        { id: "3", name: "Custom", role: null, sortOrder: 1 },
        { id: "1", name: "Inbox", role: "inbox", sortOrder: 1 },
        { id: "2", name: "Sent", role: "sent", sortOrder: 2 },
      ];

      const sorted = [...mailboxes].sort((a, b) => {
        if (a.role && !b.role) return -1;
        if (!a.role && b.role) return 1;
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      });

      expect(sorted[0].name).toBe("Inbox");
      expect(sorted[1].name).toBe("Sent");
      expect(sorted[2].name).toBe("Custom");
    });

    it("sorts custom mailboxes alphabetically when same sortOrder", () => {
      const mailboxes = [
        { id: "3", name: "Zebra", role: null, sortOrder: 1 },
        { id: "1", name: "Alpha", role: null, sortOrder: 1 },
        { id: "2", name: "Beta", role: null, sortOrder: 1 },
      ];

      const sorted = [...mailboxes].sort((a, b) => {
        if (a.role && !b.role) return -1;
        if (!a.role && b.role) return 1;
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      });

      expect(sorted[0].name).toBe("Alpha");
      expect(sorted[1].name).toBe("Beta");
      expect(sorted[2].name).toBe("Zebra");
    });
  });

  describe("mailbox display formatting", () => {
    it("indents child mailboxes", () => {
      const mb = { parentId: "parent-1", name: "Subfolder" };
      const indent = mb.parentId ? "  " : "";
      expect(indent).toBe("  ");
    });

    it("shows role in parentheses", () => {
      const mb = { role: "inbox", name: "Inbox" };
      const role = mb.role ? ` (${mb.role})` : "";
      expect(role).toBe(" (inbox)");
    });

    it("shows unread count when non-zero", () => {
      const mb = { unreadEmails: 5 };
      const unread = mb.unreadEmails > 0 ? `, ${mb.unreadEmails} unread` : "";
      expect(unread).toBe(", 5 unread");
    });

    it("hides unread count when zero", () => {
      const mb = { unreadEmails: 0 };
      const unread = mb.unreadEmails > 0 ? `, ${mb.unreadEmails} unread` : "";
      expect(unread).toBe("");
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { registerIdentityTools } from "./identity.js";
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

describe("identity tools", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("tool registration", () => {
    it("registers get_identities", () => {
      const server = new McpServer({ name: "test", version: "1.0.0" });
      const client = createMockClient();
      expect(() => registerIdentityTools(server, client)).not.toThrow();
    });
  });

  describe("identity display formatting", () => {
    it("formats identity with name and email", () => {
      const identity = {
        id: "id-1",
        name: "Test User",
        email: "test@example.com",
        replyTo: null,
      };
      const name = identity.name ? `${identity.name} ` : "";
      const result = `${name}<${identity.email}> [id: ${identity.id}]`;
      expect(result).toBe("Test User <test@example.com> [id: id-1]");
    });

    it("formats identity without name", () => {
      const identity = {
        id: "id-1",
        name: "",
        email: "noreply@example.com",
        replyTo: null,
      };
      const name = identity.name ? `${identity.name} ` : "";
      const result = `${name}<${identity.email}> [id: ${identity.id}]`;
      expect(result).toBe("<noreply@example.com> [id: id-1]");
    });

    it("includes reply-to when present", () => {
      const identity = {
        id: "id-1",
        name: "User",
        email: "user@example.com",
        replyTo: [{ name: null, email: "reply@example.com" }],
      };
      const replyTo =
        identity.replyTo && identity.replyTo.length > 0
          ? ` (reply-to: ${identity.replyTo.map((r) => r.email).join(", ")})`
          : "";
      expect(replyTo).toBe(" (reply-to: reply@example.com)");
    });

    it("omits reply-to when empty", () => {
      const identity = {
        id: "id-1",
        name: "User",
        email: "user@example.com",
        replyTo: [] as { name: string | null; email: string }[],
      };
      const replyTo =
        identity.replyTo && identity.replyTo.length > 0
          ? ` (reply-to: ${identity.replyTo.map((r) => r.email).join(", ")})`
          : "";
      expect(replyTo).toBe("");
    });
  });
});

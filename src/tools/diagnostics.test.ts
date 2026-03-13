import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { registerDiagnosticsTools } from "./diagnostics.js";
import { JMAP_CAPABILITIES } from "../jmap/types.js";

const MOCK_SESSION = {
  apiUrl: "https://api.fastmail.com/jmap/api/",
  downloadUrl: "",
  uploadUrl: "",
  accounts: {
    "acc-1": {
      name: "test@example.com",
      isPersonal: true,
      accountCapabilities: {
        [JMAP_CAPABILITIES.MAIL]: {},
        [JMAP_CAPABILITIES.SUBMISSION]: {},
      },
    },
  },
  primaryAccounts: { [JMAP_CAPABILITIES.MAIL]: "acc-1" },
  state: "s1",
  capabilities: {
    [JMAP_CAPABILITIES.CORE]: {},
    [JMAP_CAPABILITIES.MAIL]: {},
    [JMAP_CAPABILITIES.SUBMISSION]: {},
  },
};

function createMockClient() {
  const client = new JmapClient({ apiToken: "test-token" });
  (client as unknown as Record<string, unknown>).session = MOCK_SESSION;
  (client as unknown as Record<string, unknown>).accountId = "acc-1";
  return client;
}

describe("diagnostics tools", () => {
  it("registers check_function_availability without error", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const client = createMockClient();
    expect(() => registerDiagnosticsTools(server, client)).not.toThrow();
  });
});
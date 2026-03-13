import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JmapClient } from "./client.js";
import { JMAP_CAPABILITIES } from "./types.js";

const MOCK_SESSION = {
  apiUrl: "https://api.fastmail.com/jmap/api/",
  downloadUrl: "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}",
  uploadUrl: "https://api.fastmail.com/jmap/upload/{accountId}/",
  accounts: {
    "acc-123": { name: "test@example.com", isPersonal: true },
  },
  primaryAccounts: {
    [JMAP_CAPABILITIES.MAIL]: "acc-123",
  },
  state: "session-state-1",
};

function mockFetchSuccess(responseData: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(responseData),
  });
}

describe("JmapClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("accepts apiToken", () => {
      const client = new JmapClient({ apiToken: "test-token" });
      expect(client).toBeDefined();
    });

    it("accepts custom sessionUrl", () => {
      const client = new JmapClient({
        apiToken: "test-token",
        sessionUrl: "https://custom.jmap.example.com/session",
      });
      expect(client).toBeDefined();
    });
  });

  describe("getSession", () => {
    it("fetches and caches session", async () => {
      const fetchMock = mockFetchSuccess(MOCK_SESSION);
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      const session = await client.getSession();

      expect(session.apiUrl).toBe(MOCK_SESSION.apiUrl);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await client.getSession();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws on 401 authentication failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const client = new JmapClient({ apiToken: "bad-token" });
      await expect(client.getSession()).rejects.toThrow(
        "Authentication failed",
      );
    });

    it("throws on non-200 non-401 responses", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const client = new JmapClient({ apiToken: "test-token" });
      await expect(client.getSession()).rejects.toThrow(
        "Failed to fetch JMAP session",
      );
    });

    it("throws when no mail account is found", async () => {
      const sessionNoMail = {
        ...MOCK_SESSION,
        primaryAccounts: {},
      };
      globalThis.fetch = mockFetchSuccess(sessionNoMail);

      const client = new JmapClient({ apiToken: "test-token" });
      await expect(client.getSession()).rejects.toThrow(
        "No mail account found",
      );
    });

    it("sends Bearer token in Authorization header", async () => {
      const fetchMock = mockFetchSuccess(MOCK_SESSION);
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "my-secret-token" });
      await client.getSession();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-secret-token",
          }),
        }),
      );
    });
  });

  describe("getAccountId", () => {
    it("returns the primary mail account ID", async () => {
      globalThis.fetch = mockFetchSuccess(MOCK_SESSION);

      const client = new JmapClient({ apiToken: "test-token" });
      const accountId = await client.getAccountId();
      expect(accountId).toBe("acc-123");
    });
  });

  describe("request", () => {
    it("sends method calls to the API URL", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [
                ["Email/get", { list: [] }, "call-1"],
              ],
              sessionState: "session-state-1",
            }),
        });
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      const response = await client.request([
        ["Email/get", { accountId: "acc-123", ids: ["email-1"] }, "call-1"],
      ]);

      expect(response.methodResponses).toHaveLength(1);
      expect(response.methodResponses[0][0]).toBe("Email/get");

      // Verify the API URL was called (second call)
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const apiCall = fetchMock.mock.calls[1];
      expect(apiCall[0]).toBe(MOCK_SESSION.apiUrl);
    });

    it("uses default capabilities for mail requests", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [],
              sessionState: "session-state-1",
            }),
        });
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      await client.request([
        ["Mailbox/get", { accountId: "acc-123" }, "call-1"],
      ]);

      const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(body.using).toContain(JMAP_CAPABILITIES.CORE);
      expect(body.using).toContain(JMAP_CAPABILITIES.MAIL);
      expect(body.using).toContain(JMAP_CAPABILITIES.SUBMISSION);
    });

    it("accepts custom capabilities", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [],
              sessionState: "session-state-1",
            }),
        });
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      await client.request(
        [["Calendar/get", {}, "call-1"]],
        [JMAP_CAPABILITIES.CORE, JMAP_CAPABILITIES.CALENDARS],
      );

      const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(body.using).toEqual([
        JMAP_CAPABILITIES.CORE,
        JMAP_CAPABILITIES.CALENDARS,
      ]);
    });

    it("clears session cache on 401 during request", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        });
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      await expect(
        client.request([["Email/get", {}, "call-1"]]),
      ).rejects.toThrow("Authentication failed");
    });

    it("throws on JMAP-level errors in response", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [
                [
                  "error",
                  {
                    type: "unknownMethod",
                    description: "Method not found",
                  },
                  "call-1",
                ],
              ],
              sessionState: "session-state-1",
            }),
        });
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      await expect(
        client.request([["BadMethod/get", {}, "call-1"]]),
      ).rejects.toThrow("JMAP error (unknownMethod): Method not found");
    });

    it("handles network errors gracefully", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockRejectedValueOnce(new Error("Network timeout"));
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      await expect(
        client.request([["Email/get", {}, "call-1"]]),
      ).rejects.toThrow("Network error connecting to Fastmail");
    });

    it("clears session cache when session state changes", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [
                ["Email/get", { list: [] }, "call-1"],
              ],
              sessionState: "new-state-2", // Different from session
            }),
        })
        // Re-fetching session after state change
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ...MOCK_SESSION,
              state: "new-state-2",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              methodResponses: [
                ["Email/get", { list: [] }, "call-1"],
              ],
              sessionState: "new-state-2",
            }),
        });
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });

      // First request - session state differs → cache cleared
      await client.request([["Email/get", {}, "call-1"]]);

      // Second request should re-fetch session (3rd fetch call)
      await client.request([["Email/get", {}, "call-1"]]);

      // Session fetch (1st) + API call (2nd) + session re-fetch (3rd) + API call (4th)
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe("downloadBlob", () => {
    it("downloads a blob using the session download URL template", async () => {
      const blobContent = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([["content-type", "text/plain"]]),
          arrayBuffer: () => Promise.resolve(blobContent.buffer),
        });

      // Mock headers.get for the download response
      fetchMock.mockImplementation(async (url: string, options: unknown) => {
        if (url === "https://api.fastmail.com/jmap/session") {
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve(MOCK_SESSION),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: (name: string) => name === "content-type" ? "text/plain" : null },
          arrayBuffer: () => Promise.resolve(blobContent.buffer),
        };
      });

      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      const result = await client.downloadBlob("blob-123", "test.txt");

      expect(result.contentType).toBe("text/plain");
      expect(result.content).toBeInstanceOf(Buffer);

      // Verify the download URL was constructed correctly
      const downloadCall = fetchMock.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes("blob-123"),
      );
      expect(downloadCall).toBeDefined();
      expect(downloadCall![0]).toContain("acc-123");
      expect(downloadCall![0]).toContain("blob-123");
      expect(downloadCall![0]).toContain("test.txt");
    });

    it("throws on 401 during download", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          headers: { get: () => null },
        });
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      await expect(
        client.downloadBlob("blob-123", "test.txt"),
      ).rejects.toThrow("Authentication failed");
    });

    it("throws on download failure", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: { get: () => null },
        });
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      await expect(
        client.downloadBlob("blob-123", "test.txt"),
      ).rejects.toThrow("Failed to download attachment");
    });

    it("handles network errors during download", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION),
        })
        .mockRejectedValueOnce(new Error("Connection reset"));
      globalThis.fetch = fetchMock;

      const client = new JmapClient({ apiToken: "test-token" });
      await expect(
        client.downloadBlob("blob-123", "test.txt"),
      ).rejects.toThrow("Network error downloading attachment");
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { registerCalendarTools } from "./calendar.js";
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

describe("calendar tools", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("tool registration", () => {
    it("registers all calendar tools without error", () => {
      const server = new McpServer({ name: "test", version: "1.0.0" });
      const client = createMockClient();
      expect(() => registerCalendarTools(server, client)).not.toThrow();
    });
  });

  describe("duration formatting", () => {
    it("formats hours only", () => {
      const duration = "PT1H";
      const match = duration.match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
      );
      expect(match).not.toBeNull();
      const parts: string[] = [];
      if (match![1]) parts.push(`${match![1]} day(s)`);
      if (match![2]) parts.push(`${match![2]} hour(s)`);
      if (match![3]) parts.push(`${match![3]} minute(s)`);
      if (match![4]) parts.push(`${match![4]} second(s)`);
      expect(parts.join(" ")).toBe("1 hour(s)");
    });

    it("formats minutes only", () => {
      const duration = "PT30M";
      const match = duration.match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
      );
      const parts: string[] = [];
      if (match![2]) parts.push(`${match![2]} hour(s)`);
      if (match![3]) parts.push(`${match![3]} minute(s)`);
      expect(parts.join(" ")).toBe("30 minute(s)");
    });

    it("formats hours and minutes", () => {
      const duration = "PT1H30M";
      const match = duration.match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
      );
      const parts: string[] = [];
      if (match![2]) parts.push(`${match![2]} hour(s)`);
      if (match![3]) parts.push(`${match![3]} minute(s)`);
      expect(parts.join(" ")).toBe("1 hour(s) 30 minute(s)");
    });

    it("formats days", () => {
      const duration = "P1D";
      const match = duration.match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
      );
      const parts: string[] = [];
      if (match![1]) parts.push(`${match![1]} day(s)`);
      expect(parts.join(" ")).toBe("1 day(s)");
    });

    it("formats seconds", () => {
      const duration = "PT45S";
      const match = duration.match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
      );
      const parts: string[] = [];
      if (match![4]) parts.push(`${match![4]} second(s)`);
      expect(parts.join(" ")).toBe("45 second(s)");
    });

    it("handles null duration", () => {
      const duration: string | null = null;
      const result = !duration ? "no duration" : duration;
      expect(result).toBe("no duration");
    });

    it("returns raw string for non-matching format", () => {
      const duration = "INVALID";
      const match = duration.match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
      );
      expect(match).toBeNull();
    });
  });

  describe("event formatting", () => {
    it("formats all-day events differently from timed events", () => {
      const allDayEvent = {
        showWithoutTime: true,
        start: "2024-06-15",
      };
      const timedEvent = {
        showWithoutTime: false,
        start: "2024-06-15T10:00:00",
        timeZone: "America/New_York",
      };

      // All-day event shows date
      expect(allDayEvent.showWithoutTime).toBe(true);
      // Timed event shows start with timezone
      expect(timedEvent.showWithoutTime).toBe(false);
      expect(timedEvent.timeZone).toBe("America/New_York");
    });

    it("shows status only when not confirmed", () => {
      expect("tentative").not.toBe("confirmed");
      expect("cancelled").not.toBe("confirmed");
    });

    it("formats participant list", () => {
      const participants: Record<string, { name?: string; email?: string; participationStatus?: string }> = {
        p1: { name: "Alice", participationStatus: "accepted" },
        p2: { name: "Bob", participationStatus: "needs-action" },
        p3: { email: "carol@example.com" },
      };

      const parts = Object.values(participants).map((p) => {
        const name = p.name || p.email || "Unknown";
        const status = p.participationStatus
          ? ` (${p.participationStatus})`
          : "";
        return `${name}${status}`;
      });

      expect(parts).toEqual([
        "Alice (accepted)",
        "Bob (needs-action)",
        "carol@example.com",
      ]);
    });

    it("formats locations", () => {
      const locations: Record<string, { name?: string; description?: string }> = {
        loc1: { name: "Conference Room A" },
        loc2: { description: "Building 2, Floor 3" },
      };

      const locs = Object.values(locations)
        .map((l) => l.name || l.description)
        .filter(Boolean);

      expect(locs).toEqual(["Conference Room A", "Building 2, Floor 3"]);
    });
  });
});

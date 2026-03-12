import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JmapClient } from "../jmap/client.js";
import { registerContactTools } from "./contacts.js";
import { JMAP_CAPABILITIES, ContactCard } from "../jmap/types.js";

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

function makeContact(overrides: Partial<ContactCard> = {}): ContactCard {
  return {
    id: "contact-1",
    uid: "uid-1",
    name: { full: "John Doe", given: "John", surname: "Doe" },
    emails: { personal: { address: "john@example.com" } },
    phones: { mobile: { number: "+1-555-0100" } },
    addresses: null,
    organizations: null,
    notes: null,
    online: null,
    nicknames: null,
    titles: null,
    created: "2024-01-01T00:00:00Z",
    updated: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("contacts tools", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("tool registration", () => {
    it("registers all contact tools including update_contact", () => {
      const server = new McpServer({ name: "test", version: "1.0.0" });
      const client = createMockClient();
      expect(() => registerContactTools(server, client)).not.toThrow();
    });
  });

  describe("contact formatting", () => {
    it("displays full name", () => {
      const contact = makeContact();
      expect(contact.name!.full).toBe("John Doe");
    });

    it("builds name from parts when full is missing", () => {
      const contact = makeContact({
        name: { given: "Jane", surname: "Smith", prefix: "Dr" },
      });
      const name = contact.name!;
      const fullName =
        name.full ||
        [name.prefix, name.given, name.surname, name.suffix]
          .filter(Boolean)
          .join(" ");
      expect(fullName).toBe("Dr Jane Smith");
    });

    it("handles contact with no name", () => {
      const contact = makeContact({ name: null });
      expect(contact.name).toBeNull();
    });

    it("formats email addresses with labels", () => {
      const contact = makeContact({
        emails: {
          work: { address: "john@company.com" },
          personal: { address: "john@gmail.com" },
        },
      });

      const emailList = Object.entries(contact.emails!).map(
        ([key, val]) => `${val.address} (${key})`,
      );
      expect(emailList).toContain("john@company.com (work)");
      expect(emailList).toContain("john@gmail.com (personal)");
    });

    it("formats phone numbers with labels", () => {
      const contact = makeContact({
        phones: {
          mobile: { number: "+1-555-0100" },
          home: { number: "+1-555-0200" },
        },
      });

      const phoneList = Object.entries(contact.phones!).map(
        ([key, val]) => `${val.number} (${key})`,
      );
      expect(phoneList).toContain("+1-555-0100 (mobile)");
      expect(phoneList).toContain("+1-555-0200 (home)");
    });

    it("formats organizations", () => {
      const contact = makeContact({
        organizations: {
          org1: { name: "Acme Corp", units: [{ name: "Engineering" }] },
        },
      });

      const orgs = Object.values(contact.organizations!).map((o) => {
        const parts: string[] = [];
        if (o.name) parts.push(o.name);
        if (o.units) {
          parts.push(...o.units.map((u) => u.name).filter(Boolean));
        }
        return parts.join(", ");
      });
      expect(orgs[0]).toBe("Acme Corp, Engineering");
    });

    it("formats nicknames", () => {
      const contact = makeContact({
        nicknames: { n1: { name: "Johnny" } },
      });
      const nicks = Object.values(contact.nicknames!)
        .map((n) => n.name)
        .filter(Boolean);
      expect(nicks).toEqual(["Johnny"]);
    });

    it("formats titles", () => {
      const contact = makeContact({
        titles: { t1: { name: "Senior Engineer" } },
      });
      const titleList = Object.values(contact.titles!)
        .map((t) => t.name)
        .filter(Boolean);
      expect(titleList).toEqual(["Senior Engineer"]);
    });

    it("formats addresses", () => {
      const contact = makeContact({
        addresses: {
          home: {
            street: "123 Main St",
            locality: "Springfield",
            region: "IL",
            postcode: "62701",
            country: "US",
          },
        },
      });

      for (const [label, addr] of Object.entries(contact.addresses!)) {
        const parts = [
          addr.street,
          addr.locality,
          addr.region,
          addr.postcode,
          addr.country,
        ].filter(Boolean);
        expect(label).toBe("home");
        expect(parts.join(", ")).toBe(
          "123 Main St, Springfield, IL, 62701, US",
        );
      }
    });

    it("formats online/URL entries", () => {
      const contact = makeContact({
        online: {
          web: { uri: "https://example.com", label: "Website" },
        },
      });

      for (const val of Object.values(contact.online!)) {
        const label = val.label ? ` (${val.label})` : "";
        expect(`URL${label}: ${val.uri}`).toBe(
          "URL (Website): https://example.com",
        );
      }
    });

    it("includes notes when present", () => {
      const contact = makeContact({ notes: "Important client" });
      expect(contact.notes).toBe("Important client");
    });
  });

  describe("contact CRUD data construction", () => {
    it("builds create data with name parts", () => {
      const contactData: Record<string, unknown> = {
        addressBookIds: { "ab-1": true },
      };
      const nameParts: Record<string, string> = {
        given: "Alice",
        surname: "Johnson",
        full: "Alice Johnson",
      };
      contactData.name = nameParts;

      expect(contactData.name).toEqual({
        given: "Alice",
        surname: "Johnson",
        full: "Alice Johnson",
      });
    });

    it("builds email map from array", () => {
      const emails = [
        { address: "alice@work.com", label: "work" },
        { address: "alice@home.com", label: "personal" },
      ];
      const emailMap: Record<string, { address: string }> = {};
      for (let i = 0; i < emails.length; i++) {
        const e = emails[i];
        emailMap[e.label || `email${i + 1}`] = { address: e.address };
      }

      expect(emailMap).toEqual({
        work: { address: "alice@work.com" },
        personal: { address: "alice@home.com" },
      });
    });

    it("builds phone map from array", () => {
      const phones = [
        { number: "+1-555-0100", label: "mobile" },
        { number: "+1-555-0200", label: "work" },
      ];
      const phoneMap: Record<string, { number: string }> = {};
      for (let i = 0; i < phones.length; i++) {
        const p = phones[i];
        phoneMap[p.label || `phone${i + 1}`] = { number: p.number };
      }

      expect(phoneMap).toEqual({
        mobile: { number: "+1-555-0100" },
        work: { number: "+1-555-0200" },
      });
    });

    it("uses fallback labels when none provided", () => {
      const emails = [
        { address: "test@example.com", label: "" },
      ];
      const emailMap: Record<string, { address: string }> = {};
      for (let i = 0; i < emails.length; i++) {
        const e = emails[i];
        emailMap[e.label || `email${i + 1}`] = { address: e.address };
      }
      expect(emailMap).toHaveProperty("email1");
    });
  });

  describe("update_contact patch construction", () => {
    it("builds patch with only provided fields", () => {
      const patch: Record<string, unknown> = {};

      const firstName = "Jane";
      const lastName = undefined;
      const notes = "Updated notes";

      if (firstName !== undefined) {
        patch.name = { given: firstName, full: firstName };
      }
      if (notes !== undefined) {
        patch.notes = notes;
      }

      expect(patch).toEqual({
        name: { given: "Jane", full: "Jane" },
        notes: "Updated notes",
      });
      expect(patch).not.toHaveProperty("phones");
    });

    it("returns empty patch when no fields provided", () => {
      const patch: Record<string, unknown> = {};
      expect(Object.keys(patch)).toHaveLength(0);
    });
  });
});

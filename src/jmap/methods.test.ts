import { describe, it, expect } from "vitest";
import {
  mailboxGet,
  mailboxSet,
  emailQuery,
  emailGet,
  emailGetByQueryRef,
  emailSet,
  emailSubmissionSet,
  identityGet,
  threadGet,
  calendarGet,
  calendarEventGet,
  calendarEventQuery,
  calendarEventGetByQueryRef,
  calendarEventSet,
  addressBookGet,
  contactCardGet,
  contactCardQuery,
  contactCardGetByQueryRef,
  contactCardSet,
} from "./methods.js";

describe("mailboxGet", () => {
  it("returns Mailbox/get method call with default callId", () => {
    const result = mailboxGet("account-1");
    expect(result).toEqual([
      "Mailbox/get",
      { accountId: "account-1", ids: null },
      "mailbox.get",
    ]);
  });

  it("uses custom callId", () => {
    const result = mailboxGet("account-1", "custom-id");
    expect(result[2]).toBe("custom-id");
  });
});

describe("mailboxSet", () => {
  it("creates mailbox with name", () => {
    const result = mailboxSet("account-1", {
      create: { new: { name: "Test Folder" } },
    });
    expect(result[0]).toBe("Mailbox/set");
    expect(result[1]).toEqual({
      accountId: "account-1",
      create: { new: { name: "Test Folder" } },
    });
  });

  it("updates mailbox", () => {
    const result = mailboxSet("account-1", {
      update: { "mb-1": { name: "Renamed" } },
    });
    expect(result[1]).toEqual({
      accountId: "account-1",
      update: { "mb-1": { name: "Renamed" } },
    });
  });

  it("destroys mailbox", () => {
    const result = mailboxSet("account-1", { destroy: ["mb-1", "mb-2"] });
    expect(result[1]).toEqual({
      accountId: "account-1",
      destroy: ["mb-1", "mb-2"],
    });
  });
});

describe("emailQuery", () => {
  it("returns Email/query with defaults", () => {
    const result = emailQuery("account-1", { text: "hello" });
    expect(result[0]).toBe("Email/query");
    expect(result[1]).toEqual({
      accountId: "account-1",
      filter: { text: "hello" },
      sort: [{ property: "receivedAt", isAscending: false }],
      limit: 20,
      position: 0,
      collapseThreads: false,
    });
  });

  it("accepts custom sort and limit", () => {
    const result = emailQuery(
      "account-1",
      { from: "test@example.com" },
      {
        sort: [{ property: "subject", isAscending: true }],
        limit: 50,
        position: 10,
        collapseThreads: true,
      },
    );
    expect(result[1]).toEqual({
      accountId: "account-1",
      filter: { from: "test@example.com" },
      sort: [{ property: "subject", isAscending: true }],
      limit: 50,
      position: 10,
      collapseThreads: true,
    });
  });

  it("uses custom callId", () => {
    const result = emailQuery("account-1", {}, undefined, "my-query");
    expect(result[2]).toBe("my-query");
  });
});

describe("emailGet", () => {
  it("returns Email/get with full properties by default", () => {
    const result = emailGet("account-1", ["email-1", "email-2"]);
    expect(result[0]).toBe("Email/get");
    expect(result[1]).toMatchObject({
      accountId: "account-1",
      ids: ["email-1", "email-2"],
      fetchAllBodyValues: true,
    });
    // Should include default full properties
    const props = result[1].properties as string[];
    expect(props).toContain("id");
    expect(props).toContain("subject");
    expect(props).toContain("bodyValues");
    expect(props).toContain("attachments");
  });

  it("accepts custom properties", () => {
    const result = emailGet("account-1", ["email-1"], {
      properties: ["id", "subject"],
      fetchAllBodyValues: false,
    });
    expect(result[1]).toMatchObject({
      properties: ["id", "subject"],
      fetchAllBodyValues: false,
    });
  });
});

describe("emailGetByQueryRef", () => {
  it("creates back-reference to query result", () => {
    const result = emailGetByQueryRef("q1");
    expect(result[0]).toBe("Email/get");
    expect(result[1]).toMatchObject({
      "#ids": {
        resultOf: "q1",
        name: "Email/query",
        path: "/ids",
      },
    });
    // Should use summary properties by default
    const props = result[1].properties as string[];
    expect(props).toContain("id");
    expect(props).toContain("preview");
    expect(props).not.toContain("bodyValues");
  });

  it("uses custom properties and callId", () => {
    const result = emailGetByQueryRef(
      "q1",
      { properties: ["id", "from"], fetchAllBodyValues: true },
      "custom-get",
    );
    expect(result[1]).toMatchObject({
      properties: ["id", "from"],
      fetchAllBodyValues: true,
    });
    expect(result[2]).toBe("custom-get");
  });
});

describe("emailSet", () => {
  it("creates email", () => {
    const result = emailSet("account-1", {
      create: { draft: { subject: "Test" } },
    });
    expect(result[0]).toBe("Email/set");
    expect(result[1]).toEqual({
      accountId: "account-1",
      create: { draft: { subject: "Test" } },
    });
  });

  it("updates email", () => {
    const result = emailSet("account-1", {
      update: { "email-1": { "keywords/$seen": true } },
    });
    expect(result[1]).toMatchObject({
      update: { "email-1": { "keywords/$seen": true } },
    });
  });

  it("destroys emails", () => {
    const result = emailSet("account-1", {
      destroy: ["email-1"],
    });
    expect(result[1]).toMatchObject({ destroy: ["email-1"] });
  });
});

describe("emailSubmissionSet", () => {
  it("creates submission with identity and email reference", () => {
    const result = emailSubmissionSet("account-1", {
      send: { identityId: "id-1", emailId: "#draft" },
    });
    expect(result[0]).toBe("EmailSubmission/set");
    expect(result[1]).toEqual({
      accountId: "account-1",
      create: { send: { identityId: "id-1", emailId: "#draft" } },
    });
  });

  it("includes onSuccess options", () => {
    const result = emailSubmissionSet(
      "account-1",
      { send: { identityId: "id-1", emailId: "#draft" } },
      {
        onSuccessUpdateEmail: {
          "#send": { "keywords/$draft": null },
        },
      },
    );
    expect(result[1]).toMatchObject({
      onSuccessUpdateEmail: {
        "#send": { "keywords/$draft": null },
      },
    });
  });
});

describe("identityGet", () => {
  it("returns Identity/get method call", () => {
    const result = identityGet("account-1");
    expect(result).toEqual([
      "Identity/get",
      { accountId: "account-1", ids: null },
      "identity.get",
    ]);
  });
});

describe("threadGet", () => {
  it("returns Thread/get for specific thread IDs", () => {
    const result = threadGet("account-1", ["thread-1"]);
    expect(result).toEqual([
      "Thread/get",
      { accountId: "account-1", ids: ["thread-1"] },
      "thread.get",
    ]);
  });
});

describe("calendarGet", () => {
  it("returns Calendar/get method call", () => {
    const result = calendarGet("account-1");
    expect(result).toEqual([
      "Calendar/get",
      { accountId: "account-1", ids: null },
      "calendar.get",
    ]);
  });
});

describe("calendarEventGet", () => {
  it("returns CalendarEvent/get for specific IDs", () => {
    const result = calendarEventGet("account-1", ["event-1"]);
    expect(result[0]).toBe("CalendarEvent/get");
    expect(result[1]).toEqual({ accountId: "account-1", ids: ["event-1"] });
  });

  it("includes custom properties", () => {
    const result = calendarEventGet("account-1", ["event-1"], {
      properties: ["id", "title"],
    });
    expect(result[1]).toEqual({
      accountId: "account-1",
      ids: ["event-1"],
      properties: ["id", "title"],
    });
  });
});

describe("calendarEventQuery", () => {
  it("returns CalendarEvent/query with defaults", () => {
    const result = calendarEventQuery("account-1", { title: "Meeting" });
    expect(result[0]).toBe("CalendarEvent/query");
    expect(result[1]).toEqual({
      accountId: "account-1",
      filter: { title: "Meeting" },
      sort: [{ property: "start", isAscending: true }],
      limit: 50,
      position: 0,
    });
  });

  it("accepts custom options", () => {
    const result = calendarEventQuery(
      "account-1",
      {},
      { limit: 10, position: 5 },
    );
    expect(result[1]).toMatchObject({ limit: 10, position: 5 });
  });
});

describe("calendarEventGetByQueryRef", () => {
  it("creates back-reference to query", () => {
    const result = calendarEventGetByQueryRef("eq");
    expect(result[0]).toBe("CalendarEvent/get");
    expect(result[1]).toMatchObject({
      "#ids": {
        resultOf: "eq",
        name: "CalendarEvent/query",
        path: "/ids",
      },
    });
  });
});

describe("calendarEventSet", () => {
  it("creates event", () => {
    const result = calendarEventSet("account-1", {
      create: { newEvent: { title: "Test" } },
    });
    expect(result[0]).toBe("CalendarEvent/set");
    expect(result[1]).toMatchObject({
      create: { newEvent: { title: "Test" } },
    });
  });

  it("destroys events", () => {
    const result = calendarEventSet("account-1", {
      destroy: ["event-1"],
    });
    expect(result[1]).toMatchObject({ destroy: ["event-1"] });
  });
});

describe("addressBookGet", () => {
  it("returns AddressBook/get method call", () => {
    const result = addressBookGet("account-1");
    expect(result).toEqual([
      "AddressBook/get",
      { accountId: "account-1", ids: null },
      "addressbook.get",
    ]);
  });
});

describe("contactCardGet", () => {
  it("returns ContactCard/get for specific IDs", () => {
    const result = contactCardGet("account-1", ["contact-1"]);
    expect(result[0]).toBe("ContactCard/get");
    expect(result[1]).toEqual({
      accountId: "account-1",
      ids: ["contact-1"],
    });
  });

  it("includes custom properties", () => {
    const result = contactCardGet("account-1", ["contact-1"], {
      properties: ["id", "name"],
    });
    expect(result[1]).toMatchObject({ properties: ["id", "name"] });
  });
});

describe("contactCardQuery", () => {
  it("returns ContactCard/query with defaults", () => {
    const result = contactCardQuery("account-1", { text: "John" });
    expect(result[0]).toBe("ContactCard/query");
    expect(result[1]).toEqual({
      accountId: "account-1",
      filter: { text: "John" },
      sort: [{ property: "name", isAscending: true }],
      limit: 50,
      position: 0,
    });
  });
});

describe("contactCardGetByQueryRef", () => {
  it("creates back-reference to query", () => {
    const result = contactCardGetByQueryRef("cq");
    expect(result[0]).toBe("ContactCard/get");
    expect(result[1]).toMatchObject({
      "#ids": {
        resultOf: "cq",
        name: "ContactCard/query",
        path: "/ids",
      },
    });
  });
});

describe("contactCardSet", () => {
  it("creates contact", () => {
    const result = contactCardSet("account-1", {
      create: { new: { name: { full: "John Doe" } } },
    });
    expect(result[0]).toBe("ContactCard/set");
    expect(result[1]).toMatchObject({
      create: { new: { name: { full: "John Doe" } } },
    });
  });

  it("destroys contacts", () => {
    const result = contactCardSet("account-1", {
      destroy: ["contact-1"],
    });
    expect(result[1]).toMatchObject({ destroy: ["contact-1"] });
  });
});

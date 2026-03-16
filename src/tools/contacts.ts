import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import { log } from "../logger.js";
import {
  addressBookGet,
  contactCardGet,
  contactCardQuery,
  contactCardGetByQueryRef,
  contactCardSet,
} from "../jmap/methods.js";
import {
  AddressBook,
  ContactCard,
  JMAP_CAPABILITIES,
} from "../jmap/types.js";

async function getContactsUsing(client: JmapClient): Promise<string[]> {
  const contactCap = await client.getContactsCapability();
  return [
    JMAP_CAPABILITIES.CORE,
    contactCap ?? JMAP_CAPABILITIES.CONTACTS,
  ];
}

function formatContact(contact: ContactCard): string {
  const lines: string[] = [];

  // Name
  const name = contact.name;
  if (name) {
    const fullName =
      name.full ||
      [name.prefix, name.given, name.surname, name.suffix]
        .filter(Boolean)
        .join(" ");
    if (fullName) lines.push(`Name: ${fullName}`);
  }

  lines.push(`ID: ${contact.id}`);

  // Nicknames
  if (contact.nicknames) {
    const nicks = Object.values(contact.nicknames)
      .map((n) => n.name)
      .filter(Boolean);
    if (nicks.length > 0) {
      lines.push(`Nickname: ${nicks.join(", ")}`);
    }
  }

  // Titles
  if (contact.titles) {
    const titleList = Object.values(contact.titles)
      .map((t) => t.name)
      .filter(Boolean);
    if (titleList.length > 0) {
      lines.push(`Title: ${titleList.join(", ")}`);
    }
  }

  // Organization
  if (contact.organizations) {
    const orgs = Object.values(contact.organizations).map((o) => {
      const parts: string[] = [];
      if (o.name) parts.push(o.name);
      if (o.units) {
        parts.push(
          ...o.units.map((u) => u.name).filter(Boolean),
        );
      }
      return parts.join(", ");
    });
    const orgStr = orgs.filter(Boolean).join("; ");
    if (orgStr) lines.push(`Organization: ${orgStr}`);
  }

  // Emails
  if (contact.emails) {
    const emailList = Object.entries(contact.emails).map(
      ([key, val]) => `${val.address} (${key})`,
    );
    if (emailList.length > 0) {
      lines.push(`Email: ${emailList.join(", ")}`);
    }
  }

  // Phones
  if (contact.phones) {
    const phoneList = Object.entries(contact.phones).map(
      ([key, val]) => `${val.number} (${key})`,
    );
    if (phoneList.length > 0) {
      lines.push(`Phone: ${phoneList.join(", ")}`);
    }
  }

  // Addresses
  if (contact.addresses) {
    for (const [label, addr] of Object.entries(contact.addresses)) {
      const parts = [
        addr.street,
        addr.locality,
        addr.region,
        addr.postcode,
        addr.country,
      ].filter(Boolean);
      if (parts.length > 0) {
        lines.push(`Address (${label}): ${parts.join(", ")}`);
      }
    }
  }

  // Online / URLs
  if (contact.online) {
    for (const [, val] of Object.entries(contact.online)) {
      const label = val.label ? ` (${val.label})` : "";
      lines.push(`URL${label}: ${val.uri}`);
    }
  }

  // Notes
  if (contact.notes) {
    lines.push(`Notes: ${contact.notes}`);
  }

  return lines.join("\n");
}

export function registerContactTools(
  server: McpServer,
  client: JmapClient,
): void {
  server.tool(
    "list_address_books",
    "List all address books (contact groups) in the Fastmail account",
    {},
    async () => {
      log.tool("list_address_books", "invoked");
      const accountId = await client.getAccountId();
      const using = await getContactsUsing(client);

      const response = await client.request(
        [addressBookGet(accountId)],
        using,
      );

      const [, data] = response.methodResponses[0];
      const books = (data.list as AddressBook[]) ?? [];

      if (books.length === 0) {
        return {
          content: [
            { type: "text", text: "No address books found." },
          ],
        };
      }

      const sorted = [...books].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );

      const lines = sorted.map((book) => {
        const sub = book.isSubscribed ? "" : " (not subscribed)";
        return `${book.name}${sub} [id: ${book.id}]`;
      });

      log.tool("list_address_books", "completed", { count: sorted.length });
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "search_contacts",
    "Search contacts by name, email, or other criteria. Returns a summary list of matching contacts.",
    {
      query: z
        .string()
        .optional()
        .describe("Text search query to match against contact names and emails"),
      email: z
        .string()
        .optional()
        .describe("Filter by email address"),
      addressBookId: z
        .string()
        .optional()
        .describe("Filter to a specific address book ID from list_address_books"),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe(
          "Maximum number of contacts to return (default 50, max 100)",
        ),
    },
    async ({ query, email, addressBookId, limit }) => {
      log.tool("search_contacts", "invoked", { query, email, addressBookId, limit });
      const accountId = await client.getAccountId();
      const using = await getContactsUsing(client);

      const filter: Record<string, unknown> = {};
      if (query) filter.text = query;
      if (email) filter.email = email;
      if (addressBookId) filter.inAddressBook = addressBookId;

      const cappedLimit = Math.min(limit, 100);
      const queryCallId = "cq";

      const response = await client.request(
        [
          contactCardQuery(
            accountId,
            filter,
            { limit: cappedLimit },
            queryCallId,
          ),
          contactCardGetByQueryRef(queryCallId, undefined, "cg"),
        ],
        using,
      );

      const getResponse = response.methodResponses.find(
        ([name]) => name === "ContactCard/get",
      );
      if (!getResponse) {
        return {
          content: [{ type: "text", text: "No contacts found." }],
        };
      }

      const contacts = (getResponse[1].list as ContactCard[]) ?? [];
      if (contacts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No contacts match your search criteria.",
            },
          ],
        };
      }

      const queryResponse = response.methodResponses.find(
        ([name]) => name === "ContactCard/query",
      );
      const total =
        (queryResponse?.[1].total as number) ?? contacts.length;

      log.tool("search_contacts", "completed", { returned: contacts.length, total });
      const header = `Found ${total} contact(s)${total > cappedLimit ? ` (showing first ${cappedLimit})` : ""}:\n`;
      const lines = contacts.map(
        (contact, i) => `${i + 1}. ${formatContact(contact)}`,
      );

      return {
        content: [
          { type: "text", text: header + lines.join("\n\n") },
        ],
      };
    },
  );

  server.tool(
    "get_contact",
    "Get full details of a specific contact by their ID",
    {
      contactId: z
        .string()
        .describe("The contact ID to retrieve"),
    },
    async ({ contactId }) => {
      log.tool("get_contact", "invoked", { contactId });
      const accountId = await client.getAccountId();
      const using = await getContactsUsing(client);

      const response = await client.request(
        [contactCardGet(accountId, [contactId])],
        using,
      );

      const [, data] = response.methodResponses[0];
      const contacts = (data.list as ContactCard[]) ?? [];

      if (contacts.length === 0) {
        throw new Error(`Contact not found: ${contactId}`);
      }

      log.tool("get_contact", "completed", { contactId });
      return {
        content: [
          { type: "text", text: formatContact(contacts[0]) },
        ],
      };
    },
  );

  server.tool(
    "create_contact",
    "Create a new contact in the Fastmail address book",
    {
      addressBookId: z
        .string()
        .describe(
          "Address book ID to create the contact in (from list_address_books)",
        ),
      firstName: z
        .string()
        .optional()
        .describe("Contact's first/given name"),
      lastName: z
        .string()
        .optional()
        .describe("Contact's last/family name"),
      prefix: z
        .string()
        .optional()
        .describe("Name prefix (e.g. Mr, Ms, Dr)"),
      suffix: z
        .string()
        .optional()
        .describe("Name suffix (e.g. Jr, III)"),
      emails: z
        .array(
          z.object({
            address: z.string().describe("Email address"),
            label: z
              .string()
              .optional()
              .default("personal")
              .describe(
                "Label for the email (e.g. personal, work)",
              ),
          }),
        )
        .optional()
        .describe("Contact email addresses"),
      phones: z
        .array(
          z.object({
            number: z.string().describe("Phone number"),
            label: z
              .string()
              .optional()
              .default("mobile")
              .describe("Label for the phone (e.g. mobile, work, home)"),
          }),
        )
        .optional()
        .describe("Contact phone numbers"),
      company: z
        .string()
        .optional()
        .describe("Company/organization name"),
      jobTitle: z.string().optional().describe("Job title"),
      notes: z.string().optional().describe("Notes about the contact"),
    },
    async ({
      addressBookId,
      firstName,
      lastName,
      prefix: namePrefix,
      suffix: nameSuffix,
      emails,
      phones,
      company,
      jobTitle,
      notes,
    }) => {
      log.tool("create_contact", "invoked", { addressBookId, firstName, lastName });
      const accountId = await client.getAccountId();
      const using = await getContactsUsing(client);

      const contactData: Record<string, unknown> = {
        addressBookIds: { [addressBookId]: true },
      };

      // Name
      const nameParts: Record<string, string> = {};
      if (firstName) nameParts.given = firstName;
      if (lastName) nameParts.surname = lastName;
      if (namePrefix) nameParts.prefix = namePrefix;
      if (nameSuffix) nameParts.suffix = nameSuffix;
      if (Object.keys(nameParts).length > 0) {
        const fullParts = [
          namePrefix,
          firstName,
          lastName,
          nameSuffix,
        ].filter(Boolean);
        nameParts.full = fullParts.join(" ");
        contactData.name = nameParts;
      }

      // Emails
      if (emails && emails.length > 0) {
        const emailMap: Record<string, { address: string }> = {};
        for (let i = 0; i < emails.length; i++) {
          const e = emails[i];
          emailMap[e.label || `email${i + 1}`] = {
            address: e.address,
          };
        }
        contactData.emails = emailMap;
      }

      // Phones
      if (phones && phones.length > 0) {
        const phoneMap: Record<string, { number: string }> = {};
        for (let i = 0; i < phones.length; i++) {
          const p = phones[i];
          phoneMap[p.label || `phone${i + 1}`] = {
            number: p.number,
          };
        }
        contactData.phones = phoneMap;
      }

      // Organization
      if (company || jobTitle) {
        const orgData: Record<string, unknown> = {};
        if (company) orgData.name = company;
        contactData.organizations = { org1: orgData };

        if (jobTitle) {
          contactData.titles = { t1: { name: jobTitle } };
        }
      }

      // Notes
      if (notes) contactData.notes = notes;

      const response = await client.request(
        [
          contactCardSet(accountId, {
            create: { newContact: contactData },
          }),
        ],
        using,
      );

      const [, data] = response.methodResponses[0];
      const created = data.created as
        | Record<string, { id: string }>
        | undefined;

      if (!created?.newContact) {
        const notCreated = data.notCreated as
          | Record<string, { type: string; description?: string }>
          | undefined;
        const error = notCreated?.newContact;
        throw new Error(
          `Failed to create contact: ${error?.description ?? error?.type ?? "Unknown error"}`,
        );
      }

      const displayName = [firstName, lastName]
        .filter(Boolean)
        .join(" ") || "New contact";

      log.tool("create_contact", "completed", { contactId: created.newContact.id, displayName });
      return {
        content: [
          {
            type: "text",
            text: `Contact "${displayName}" created successfully [id: ${created.newContact.id}]`,
          },
        ],
      };
    },
  );

  server.tool(
    "delete_contact",
    "Delete a contact by their ID",
    {
      contactId: z.string().describe("The contact ID to delete"),
    },
    async ({ contactId }) => {
      log.tool("delete_contact", "invoked", { contactId });
      const accountId = await client.getAccountId();
      const using = await getContactsUsing(client);

      const response = await client.request(
        [contactCardSet(accountId, { destroy: [contactId] })],
        using,
      );

      const [, data] = response.methodResponses[0];
      const notDestroyed = data.notDestroyed as
        | Record<string, { type: string; description?: string }>
        | undefined;

      if (notDestroyed?.[contactId]) {
        throw new Error(
          `Failed to delete contact: ${notDestroyed[contactId].description ?? notDestroyed[contactId].type}`,
        );
      }

      log.tool("delete_contact", "completed", { contactId });
      return {
        content: [
          {
            type: "text",
            text: `Contact ${contactId} deleted successfully.`,
          },
        ],
      };
    },
  );

  server.tool(
    "update_contact",
    "Update an existing contact's information. Only the fields you provide will be updated; other fields remain unchanged.",
    {
      contactId: z.string().describe("The contact ID to update (from search_contacts or get_contact)"),
      firstName: z
        .string()
        .optional()
        .describe("Updated first/given name"),
      lastName: z
        .string()
        .optional()
        .describe("Updated last/family name"),
      prefix: z
        .string()
        .optional()
        .describe("Updated name prefix (e.g. Mr, Ms, Dr)"),
      suffix: z
        .string()
        .optional()
        .describe("Updated name suffix (e.g. Jr, III)"),
      emails: z
        .array(
          z.object({
            address: z.string().describe("Email address"),
            label: z
              .string()
              .optional()
              .default("personal")
              .describe("Label for the email (e.g. personal, work)"),
          }),
        )
        .optional()
        .describe("Updated email addresses (replaces all existing emails)"),
      phones: z
        .array(
          z.object({
            number: z.string().describe("Phone number"),
            label: z
              .string()
              .optional()
              .default("mobile")
              .describe("Label for the phone (e.g. mobile, work, home)"),
          }),
        )
        .optional()
        .describe("Updated phone numbers (replaces all existing phones)"),
      company: z
        .string()
        .optional()
        .describe("Updated company/organization name"),
      jobTitle: z.string().optional().describe("Updated job title"),
      notes: z.string().optional().describe("Updated notes about the contact"),
    },
    async ({
      contactId,
      firstName,
      lastName,
      prefix: namePrefix,
      suffix: nameSuffix,
      emails,
      phones,
      company,
      jobTitle,
      notes,
    }) => {
      log.tool("update_contact", "invoked", { contactId });
      const accountId = await client.getAccountId();
      const using = await getContactsUsing(client);

      const patch: Record<string, unknown> = {};

      // Name updates
      if (firstName !== undefined || lastName !== undefined || namePrefix !== undefined || nameSuffix !== undefined) {
        const nameParts: Record<string, string> = {};
        if (firstName) nameParts.given = firstName;
        if (lastName) nameParts.surname = lastName;
        if (namePrefix) nameParts.prefix = namePrefix;
        if (nameSuffix) nameParts.suffix = nameSuffix;
        const fullParts = [namePrefix, firstName, lastName, nameSuffix].filter(Boolean);
        nameParts.full = fullParts.join(" ");
        patch.name = nameParts;
      }

      // Emails
      if (emails !== undefined) {
        const emailMap: Record<string, { address: string }> = {};
        for (let i = 0; i < emails.length; i++) {
          const e = emails[i];
          emailMap[e.label || `email${i + 1}`] = { address: e.address };
        }
        patch.emails = emailMap;
      }

      // Phones
      if (phones !== undefined) {
        const phoneMap: Record<string, { number: string }> = {};
        for (let i = 0; i < phones.length; i++) {
          const p = phones[i];
          phoneMap[p.label || `phone${i + 1}`] = { number: p.number };
        }
        patch.phones = phoneMap;
      }

      // Organization
      if (company !== undefined || jobTitle !== undefined) {
        if (company !== undefined) {
          patch.organizations = { org1: { name: company } };
        }
        if (jobTitle !== undefined) {
          patch.titles = { t1: { name: jobTitle } };
        }
      }

      // Notes
      if (notes !== undefined) {
        patch.notes = notes;
      }

      if (Object.keys(patch).length === 0) {
        return {
          content: [{ type: "text", text: "No updates specified." }],
        };
      }

      const response = await client.request(
        [
          contactCardSet(accountId, {
            update: { [contactId]: patch },
          }),
        ],
        using,
      );

      const [, data] = response.methodResponses[0];
      const notUpdated = data.notUpdated as
        | Record<string, { type: string; description?: string }>
        | undefined;

      if (notUpdated?.[contactId]) {
        throw new Error(
          `Failed to update contact: ${notUpdated[contactId].description ?? notUpdated[contactId].type}`,
        );
      }

      log.tool("update_contact", "completed", { contactId });
      return {
        content: [
          {
            type: "text",
            text: `Contact ${contactId} updated successfully.`,
          },
        ],
      };
    },
  );
}

import { MethodCall } from "./types.js";

// --- Mailbox methods ---

export function mailboxGet(accountId: string, callId = "mailbox.get"): MethodCall {
  return ["Mailbox/get", { accountId, ids: null }, callId];
}

export function mailboxSet(
  accountId: string,
  operations: {
    create?: Record<string, { name: string; parentId?: string | null }>;
    update?: Record<string, Record<string, unknown>>;
    destroy?: string[];
  },
  callId = "mailbox.set",
): MethodCall {
  return ["Mailbox/set", { accountId, ...operations }, callId];
}

// --- Email methods ---

const EMAIL_SUMMARY_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "from",
  "to",
  "subject",
  "receivedAt",
  "preview",
  "keywords",
];

const EMAIL_FULL_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "receivedAt",
  "size",
  "preview",
  "bodyValues",
  "textBody",
  "htmlBody",
  "attachments",
  "keywords",
  "messageId",
  "inReplyTo",
  "references",
];

export function emailQuery(
  accountId: string,
  filter: Record<string, unknown>,
  options?: {
    sort?: { property: string; isAscending: boolean }[];
    limit?: number;
    position?: number;
    collapseThreads?: boolean;
  },
  callId = "email.query",
): MethodCall {
  return [
    "Email/query",
    {
      accountId,
      filter,
      sort: options?.sort ?? [{ property: "receivedAt", isAscending: false }],
      limit: options?.limit ?? 20,
      position: options?.position ?? 0,
      collapseThreads: options?.collapseThreads ?? false,
    },
    callId,
  ];
}

export function emailGet(
  accountId: string,
  ids: string[],
  options?: { properties?: string[]; fetchAllBodyValues?: boolean },
  callId = "email.get",
): MethodCall {
  return [
    "Email/get",
    {
      accountId,
      ids,
      properties: options?.properties ?? EMAIL_FULL_PROPERTIES,
      fetchAllBodyValues: options?.fetchAllBodyValues ?? true,
    },
    callId,
  ];
}

export function emailGetByQueryRef(
  accountId: string,
  refCallId: string,
  options?: { properties?: string[]; fetchAllBodyValues?: boolean },
  callId = "email.get",
): MethodCall {
  return [
    "Email/get",
    {
      accountId,
      "#ids": {
        resultOf: refCallId,
        name: "Email/query",
        path: "/ids",
      },
      properties: options?.properties ?? EMAIL_SUMMARY_PROPERTIES,
      fetchAllBodyValues: options?.fetchAllBodyValues ?? false,
    },
    callId,
  ];
}

export function emailSet(
  accountId: string,
  operations: {
    create?: Record<string, Record<string, unknown>>;
    update?: Record<string, Record<string, unknown>>;
    destroy?: string[];
  },
  callId = "email.set",
): MethodCall {
  return ["Email/set", { accountId, ...operations }, callId];
}

// --- EmailSubmission methods ---

export function emailSubmissionSet(
  accountId: string,
  create: Record<string, { identityId: string; emailId: string }>,
  options?: {
    onSuccessUpdateEmail?: Record<string, Record<string, unknown>>;
    onSuccessDestroyEmail?: string[];
  },
  callId = "emailsubmission.set",
): MethodCall {
  return [
    "EmailSubmission/set",
    {
      accountId,
      create,
      ...options,
    },
    callId,
  ];
}

// --- Identity methods ---

export function identityGet(accountId: string, callId = "identity.get"): MethodCall {
  return ["Identity/get", { accountId, ids: null }, callId];
}

// --- Thread methods ---

export function threadGet(
  accountId: string,
  ids: string[],
  callId = "thread.get",
): MethodCall {
  return ["Thread/get", { accountId, ids }, callId];
}

// --- Calendar methods ---

export function calendarGet(
  accountId: string,
  callId = "calendar.get",
): MethodCall {
  return ["Calendar/get", { accountId, ids: null }, callId];
}

export function calendarEventGet(
  accountId: string,
  ids: string[],
  options?: { properties?: string[] },
  callId = "calendarevent.get",
): MethodCall {
  const args: Record<string, unknown> = { accountId, ids };
  if (options?.properties) {
    args.properties = options.properties;
  }
  return ["CalendarEvent/get", args, callId];
}

const CALENDAR_EVENT_PROPERTIES = [
  "id",
  "calendarIds",
  "uid",
  "title",
  "description",
  "start",
  "timeZone",
  "duration",
  "showWithoutTime",
  "status",
  "freeBusyStatus",
  "locations",
  "participants",
  "alerts",
  "recurrenceRules",
  "recurrenceOverrides",
  "created",
  "updated",
  "replyTo",
  "useDefaultAlerts",
  "keywords",
  "color",
];

export function calendarEventQuery(
  accountId: string,
  filter: Record<string, unknown>,
  options?: {
    sort?: { property: string; isAscending: boolean }[];
    limit?: number;
    position?: number;
  },
  callId = "calendarevent.query",
): MethodCall {
  return [
    "CalendarEvent/query",
    {
      accountId,
      filter,
      sort: options?.sort ?? [{ property: "start", isAscending: true }],
      limit: options?.limit ?? 50,
      position: options?.position ?? 0,
    },
    callId,
  ];
}

export function calendarEventGetByQueryRef(
  refCallId: string,
  options?: { properties?: string[] },
  callId = "calendarevent.get",
): MethodCall {
  return [
    "CalendarEvent/get",
    {
      "#ids": {
        resultOf: refCallId,
        name: "CalendarEvent/query",
        path: "/ids",
      },
      properties: options?.properties ?? CALENDAR_EVENT_PROPERTIES,
    },
    callId,
  ];
}

export function calendarEventSet(
  accountId: string,
  operations: {
    create?: Record<string, Record<string, unknown>>;
    update?: Record<string, Record<string, unknown>>;
    destroy?: string[];
  },
  callId = "calendarevent.set",
): MethodCall {
  return ["CalendarEvent/set", { accountId, ...operations }, callId];
}

// --- Contact methods ---

export function addressBookGet(
  accountId: string,
  callId = "addressbook.get",
): MethodCall {
  return ["AddressBook/get", { accountId, ids: null }, callId];
}

export function contactCardGet(
  accountId: string,
  ids: string[],
  options?: { properties?: string[] },
  callId = "contactcard.get",
): MethodCall {
  const args: Record<string, unknown> = { accountId, ids };
  if (options?.properties) {
    args.properties = options.properties;
  }
  return ["ContactCard/get", args, callId];
}

const CONTACT_CARD_PROPERTIES = [
  "id",
  "uid",
  "name",
  "emails",
  "phones",
  "addresses",
  "organizations",
  "notes",
  "online",
  "nicknames",
  "titles",
  "created",
  "updated",
];

export function contactCardQuery(
  accountId: string,
  filter: Record<string, unknown>,
  options?: {
    sort?: { property: string; isAscending: boolean }[];
    limit?: number;
    position?: number;
  },
  callId = "contactcard.query",
): MethodCall {
  return [
    "ContactCard/query",
    {
      accountId,
      filter,
      sort: options?.sort ?? [{ property: "name", isAscending: true }],
      limit: options?.limit ?? 50,
      position: options?.position ?? 0,
    },
    callId,
  ];
}

export function contactCardGetByQueryRef(
  refCallId: string,
  options?: { properties?: string[] },
  callId = "contactcard.get",
): MethodCall {
  return [
    "ContactCard/get",
    {
      "#ids": {
        resultOf: refCallId,
        name: "ContactCard/query",
        path: "/ids",
      },
      properties: options?.properties ?? CONTACT_CARD_PROPERTIES,
    },
    callId,
  ];
}

export function contactCardSet(
  accountId: string,
  operations: {
    create?: Record<string, Record<string, unknown>>;
    update?: Record<string, Record<string, unknown>>;
    destroy?: string[];
  },
  callId = "contactcard.set",
): MethodCall {
  return ["ContactCard/set", { accountId, ...operations }, callId];
}

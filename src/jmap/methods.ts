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
  refCallId: string,
  options?: { properties?: string[]; fetchAllBodyValues?: boolean },
  callId = "email.get",
): MethodCall {
  return [
    "Email/get",
    {
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

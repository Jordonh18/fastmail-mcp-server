export interface EmailAddress {
  name: string | null;
  email: string;
}

export interface JmapSession {
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  accounts: Record<string, { name: string; isPersonal: boolean }>;
  primaryAccounts: Record<string, string>;
  state: string;
}

export interface JmapRequest {
  using: string[];
  methodCalls: MethodCall[];
}

export interface JmapResponse {
  methodResponses: MethodCall[];
  sessionState: string;
}

export type MethodCall = [string, Record<string, unknown>, string];

export interface Email {
  id: string;
  blobId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  cc: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  subject: string;
  receivedAt: string;
  size: number;
  preview: string;
  bodyValues: Record<string, { value: string; isEncodingProblem: boolean }>;
  textBody: { partId: string; type: string }[];
  htmlBody: { partId: string; type: string }[];
  attachments: { name: string | null; type: string; size: number }[];
  keywords: Record<string, boolean>;
  messageId: string[];
  inReplyTo: string[] | null;
  references: string[] | null;
}

export interface Mailbox {
  id: string;
  name: string;
  parentId: string | null;
  role: string | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
}

export interface Identity {
  id: string;
  name: string;
  email: string;
  replyTo: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
}

export interface Thread {
  id: string;
  emailIds: string[];
}

export interface JmapError {
  type: string;
  description?: string;
}

export const JMAP_CAPABILITIES = {
  CORE: "urn:ietf:params:jmap:core",
  MAIL: "urn:ietf:params:jmap:mail",
  SUBMISSION: "urn:ietf:params:jmap:submission",
} as const;

export const SESSION_URL = "https://api.fastmail.com/jmap/session";

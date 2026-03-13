export interface EmailAddress {
  name: string | null;
  email: string;
}

export interface JmapSession {
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  accounts: Record<
    string,
    {
      name: string;
      isPersonal: boolean;
      accountCapabilities?: Record<string, unknown>;
    }
  >;
  primaryAccounts: Record<string, string>;
  state: string;
  capabilities?: Record<string, unknown>;
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
  attachments: { blobId: string; name: string | null; type: string; size: number }[];
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

// --- Calendar types ---

export interface Calendar {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isVisible: boolean;
  isSubscribed: boolean;
  defaultAlertsWithTime: Record<string, CalendarAlert> | null;
  defaultAlertsWithoutTime: Record<string, CalendarAlert> | null;
  timeZone: string | null;
  myRights: {
    mayReadFreeBusy: boolean;
    mayReadItems: boolean;
    mayAddItems: boolean;
    mayUpdatePrivate: boolean;
    mayRSVP: boolean;
    mayUpdateOwn: boolean;
    mayUpdateAll: boolean;
    mayRemoveOwn: boolean;
    mayRemoveAll: boolean;
    mayAdmin: boolean;
    mayDelete: boolean;
  } | null;
}

export interface CalendarAlert {
  "@type": string;
  trigger: {
    "@type": string;
    offset?: string;
    when?: string;
  };
  action: string;
}

export interface CalendarEventLocation {
  "@type"?: string;
  name?: string;
  description?: string;
}

export interface CalendarEventParticipant {
  "@type"?: string;
  name?: string;
  email?: string;
  sendTo?: Record<string, string>;
  kind?: string;
  roles?: Record<string, boolean>;
  participationStatus?: string;
  expectReply?: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarIds: Record<string, boolean>;
  uid: string;
  title: string;
  description: string | null;
  start: string;
  timeZone: string | null;
  duration: string | null;
  showWithoutTime: boolean;
  status: string;
  freeBusyStatus: string;
  locations: Record<string, CalendarEventLocation> | null;
  participants: Record<string, CalendarEventParticipant> | null;
  alerts: Record<string, CalendarAlert> | null;
  recurrenceRules: Record<string, unknown>[] | null;
  recurrenceOverrides: Record<string, Record<string, unknown>> | null;
  created: string | null;
  updated: string | null;
  replyTo: Record<string, string> | null;
  useDefaultAlerts: boolean;
  keywords: Record<string, boolean> | null;
  color: string | null;
}

// --- Contact types ---

export interface AddressBook {
  id: string;
  name: string;
  isSubscribed: boolean;
  sortOrder: number;
  myRights: {
    mayRead: boolean;
    mayWrite: boolean;
    mayAdmin: boolean;
    mayDelete: boolean;
  } | null;
}

export interface ContactCard {
  id: string;
  uid: string;
  name: {
    full?: string;
    given?: string;
    surname?: string;
    prefix?: string;
    suffix?: string;
  } | null;
  emails: Record<string, { address: string }> | null;
  phones: Record<string, { number: string }> | null;
  addresses: Record<
    string,
    {
      street?: string;
      locality?: string;
      region?: string;
      postcode?: string;
      country?: string;
    }
  > | null;
  organizations: Record<
    string,
    {
      name?: string;
      units?: { name: string }[];
    }
  > | null;
  notes: string | null;
  online: Record<string, { uri: string; label?: string }> | null;
  nicknames: Record<string, { name: string }> | null;
  titles: Record<string, { name: string }> | null;
  created: string | null;
  updated: string | null;
}

export const JMAP_CAPABILITIES = {
  CORE: "urn:ietf:params:jmap:core",
  MAIL: "urn:ietf:params:jmap:mail",
  SUBMISSION: "urn:ietf:params:jmap:submission",
  CALENDARS: "urn:ietf:params:jmap:calendars",
  CONTACTS: "urn:ietf:params:jmap:contacts",
  // Fastmail-specific capability URIs (used as fallbacks)
  FM_CALENDARS: "https://www.fastmail.com/dev/calendars",
  FM_CONTACTS: "https://www.fastmail.com/dev/contacts",
} as const;

export const SESSION_URL = "https://api.fastmail.com/jmap/session";

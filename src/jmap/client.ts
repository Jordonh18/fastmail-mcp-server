import {
  JmapSession,
  JmapRequest,
  JmapResponse,
  MethodCall,
  JMAP_CAPABILITIES,
  SESSION_URL,
} from "./types.js";

export class JmapClient {
  private apiToken: string;
  private sessionUrl: string;
  private session: JmapSession | null = null;
  private accountId: string | null = null;

  constructor(options: { apiToken: string; sessionUrl?: string }) {
    this.apiToken = options.apiToken;
    this.sessionUrl = options.sessionUrl ?? SESSION_URL;
  }

  /**
   * Sanitize an error message to ensure it never contains the API token.
   */
  private sanitizeError(message: string): string {
    if (this.apiToken && message.includes(this.apiToken)) {
      return message.replaceAll(this.apiToken, "[REDACTED]");
    }
    return message;
  }

  private get authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  async getSession(): Promise<JmapSession> {
    if (this.session) {
      return this.session;
    }

    const response = await fetch(this.sessionUrl, {
      method: "GET",
      headers: this.authHeaders,
    });

    if (response.status === 401) {
      throw new Error(
        "Authentication failed. Check your FASTMAIL_API_TOKEN is valid.",
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch JMAP session: ${response.status} ${response.statusText}`,
      );
    }

    this.session = (await response.json()) as JmapSession;

    const mailAccountId =
      this.session.primaryAccounts[JMAP_CAPABILITIES.MAIL];
    if (!mailAccountId) {
      throw new Error(
        "No mail account found. Ensure your API token has JMAP mail access.",
      );
    }

    this.accountId = mailAccountId;
    return this.session;
  }

  async getAccountId(): Promise<string> {
    if (!this.accountId) {
      await this.getSession();
    }
    return this.accountId!;
  }

  /**
   * Check if a given JMAP capability is available in the current session.
   */
  async hasCapability(capability: string): Promise<boolean> {
    const session = await this.getSession();
    const accountId = await this.getAccountId();
    const account = Object.entries(session.accounts ?? {}).find(
      ([id]) => id === accountId,
    );
    if (!account) return false;
    const accountObj = account[1] as Record<string, unknown>;
    const capabilities = accountObj.accountCapabilities as
      | Record<string, unknown>
      | undefined;
    if (capabilities && capability in capabilities) return true;
    // Also check top-level session capabilities
    const sessionCaps = (session as unknown as Record<string, unknown>)
      .capabilities as Record<string, unknown> | undefined;
    return !!(sessionCaps && capability in sessionCaps);
  }

  /**
   * Get the calendar capability URI available for this session.
   * Returns the standard URI or Fastmail-specific one, or null if unavailable.
   */
  async getCalendarCapability(): Promise<string | null> {
    if (await this.hasCapability(JMAP_CAPABILITIES.CALENDARS)) {
      return JMAP_CAPABILITIES.CALENDARS;
    }
    if (await this.hasCapability(JMAP_CAPABILITIES.FM_CALENDARS)) {
      return JMAP_CAPABILITIES.FM_CALENDARS;
    }
    return null;
  }

  /**
   * Get the contacts capability URI available for this session.
   * Returns the standard URI or Fastmail-specific one, or null if unavailable.
   */
  async getContactsCapability(): Promise<string | null> {
    if (await this.hasCapability(JMAP_CAPABILITIES.CONTACTS)) {
      return JMAP_CAPABILITIES.CONTACTS;
    }
    if (await this.hasCapability(JMAP_CAPABILITIES.FM_CONTACTS)) {
      return JMAP_CAPABILITIES.FM_CONTACTS;
    }
    return null;
  }

  async request(
    methodCalls: MethodCall[],
    using?: string[],
  ): Promise<JmapResponse> {
    const session = await this.getSession();

    const body: JmapRequest = {
      using: using ?? [
        JMAP_CAPABILITIES.CORE,
        JMAP_CAPABILITIES.MAIL,
        JMAP_CAPABILITIES.SUBMISSION,
      ],
      methodCalls,
    };

    let response: Response;
    try {
      response = await fetch(session.apiUrl, {
        method: "POST",
        headers: this.authHeaders,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        this.sanitizeError(`Network error connecting to Fastmail: ${err instanceof Error ? err.message : String(err)}`),
      );
    }

    if (response.status === 401) {
      this.session = null;
      this.accountId = null;
      throw new Error(
        "Authentication failed. Your API token may have been revoked.",
      );
    }

    if (!response.ok) {
      throw new Error(
        `JMAP request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as JmapResponse;

    // Check for session state changes
    if (this.session && result.sessionState !== this.session.state) {
      this.session = null; // Force re-fetch on next request
    }

    // Check for JMAP-level errors in method responses
    for (const [methodName, args] of result.methodResponses) {
      if (methodName === "error") {
        const errorType = args.type as string;
        const description = args.description as string | undefined;
        throw new Error(
          `JMAP error (${errorType}): ${description ?? "Unknown error"}`,
        );
      }
    }

    return result;
  }

  /**
   * Download a blob (attachment) using the JMAP download URL template.
   * Returns the blob content as a Buffer and its content type.
   */
  async downloadBlob(
    blobId: string,
    name: string,
  ): Promise<{ content: Buffer; contentType: string }> {
    const session = await this.getSession();
    const accountId = await this.getAccountId();

    const url = session.downloadUrl
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{blobId}", encodeURIComponent(blobId))
      .replace("{name}", encodeURIComponent(name))
      .replace("{type}", "application/octet-stream");

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      });
    } catch (err) {
      throw new Error(
        this.sanitizeError(`Network error downloading attachment: ${err instanceof Error ? err.message : String(err)}`),
      );
    }

    if (response.status === 401) {
      this.session = null;
      this.accountId = null;
      throw new Error(
        "Authentication failed. Your API token may have been revoked.",
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to download attachment: ${response.status} ${response.statusText}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    return {
      content: Buffer.from(arrayBuffer),
      contentType,
    };
  }
}

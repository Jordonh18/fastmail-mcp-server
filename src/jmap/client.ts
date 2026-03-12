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
        `Network error connecting to Fastmail: ${err instanceof Error ? err.message : String(err)}`,
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
}

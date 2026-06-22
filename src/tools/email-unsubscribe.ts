import { isIP } from "node:net";

export const DEFAULT_EMAIL_HEADERS = [
  "List-Unsubscribe",
  "List-Unsubscribe-Post",
  "Reply-To",
  "Return-Path",
  "Authentication-Results",
];

export const LIST_UNSUBSCRIBE_HEADER = "List-Unsubscribe";
export const LIST_UNSUBSCRIBE_POST_HEADER = "List-Unsubscribe-Post";
export const ONE_CLICK_POST_VALUE = "List-Unsubscribe=One-Click";

const ONE_CLICK_TIMEOUT_MS = 10_000;

export function uniqueHeaderNames(headers: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const header of headers) {
    const name = header.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export function headerProperty(headerName: string): string {
  return headerName.toLowerCase() === "list-unsubscribe"
    ? `header:${headerName}:asURLs`
    : `header:${headerName}:asText`;
}

export function formatHeaderValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.map((item) => String(item)).join(", ");
  }
  return String(value);
}

export function findFirstSafeUnsubscribeUrl(value: unknown): URL | null {
  const urls = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];

  for (const urlValue of urls) {
    try {
      const url = new URL(urlValue);
      if (isSafeUnsubscribeUrl(url)) return url;
    } catch {
      // Ignore malformed header URLs.
    }
  }

  return null;
}

function isSafeUnsubscribeUrl(url: URL): boolean {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return url.protocol === "https:" &&
    hostname !== "localhost" &&
    !hostname.endsWith(".localhost") &&
    isIP(hostname) === 0;
}

export async function postOneClickUnsubscribe(url: URL): Promise<Response> {
  return fetch(url.href, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: ONE_CLICK_POST_VALUE,
    redirect: "manual",
    signal: AbortSignal.timeout(ONE_CLICK_TIMEOUT_MS),
  });
}

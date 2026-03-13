import { Email, EmailAddress } from "../jmap/types.js";

export const MAX_BODY_LENGTH = 50_000;

export function formatAddress(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

export function formatAddressList(addrs: EmailAddress[] | null): string {
  if (!addrs || addrs.length === 0) return "";
  return addrs.map(formatAddress).join(", ");
}

export function stripHtml(html: string): string {
  // Remove style and script blocks; loop to handle nested evasion attempts
  let result = html;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/<style[\s\S]*?<\/style[^>]*>/gi, "");
  } while (result !== prev);
  do {
    prev = result;
    result = result.replace(/<script[\s\S]*?<\/script[^>]*>/gi, "");
  } while (result !== prev);

  return result
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    // Unescape HTML entities first so tag stripping catches entity-encoded tags
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")    // &amp; last to avoid double-unescaping other entities
    .replace(/<[^>]+>/g, "")   // Strip all remaining tags after entity unescaping
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getEmailBody(email: Email): string {
  if (email.textBody && email.textBody.length > 0) {
    const partId = email.textBody[0].partId;
    const body = email.bodyValues?.[partId];
    if (body) {
      const text = body.value;
      const suffix = body.isEncodingProblem ? "\n\n[Note: encoding issues detected]" : "";
      return text.length > MAX_BODY_LENGTH
        ? text.slice(0, MAX_BODY_LENGTH) + "\n\n[Content truncated]"
        : text + suffix;
    }
  }

  if (email.htmlBody && email.htmlBody.length > 0) {
    const partId = email.htmlBody[0].partId;
    const body = email.bodyValues?.[partId];
    if (body) {
      const text = stripHtml(body.value);
      return text.length > MAX_BODY_LENGTH
        ? text.slice(0, MAX_BODY_LENGTH) + "\n\n[Content truncated]"
        : text;
    }
  }

  return "[No body content available]";
}

export function formatEmailSummary(email: Email, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : "";
  const from = formatAddressList(email.from) || "Unknown sender";
  const date = new Date(email.receivedAt).toLocaleString();
  const flags: string[] = [];
  if (!email.keywords?.["$seen"]) flags.push("UNREAD");
  if (email.keywords?.["$flagged"]) flags.push("FLAGGED");
  const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";

  return [
    `${prefix}${email.subject || "(no subject)"}${flagStr}`,
    `  From: ${from}`,
    `  Date: ${date}`,
    `  Preview: ${email.preview}`,
    `  [id: ${email.id}] [thread: ${email.threadId}]`,
  ].join("\n");
}

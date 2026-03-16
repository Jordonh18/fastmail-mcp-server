/**
 * Verbose logger for the Fastmail MCP server.
 * All output goes to stderr so it doesn't interfere with MCP stdio transport.
 */

function timestamp(): string {
  return new Date().toISOString();
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.message}${a.stack ? `\n${a.stack}` : ""}`;
      return JSON.stringify(a, null, 2);
    })
    .join(" ");
}

export const log = {
  info(...args: unknown[]): void {
    console.error(`[${timestamp()}] [INFO]  ${formatArgs(args)}`);
  },

  debug(...args: unknown[]): void {
    console.error(`[${timestamp()}] [DEBUG] ${formatArgs(args)}`);
  },

  warn(...args: unknown[]): void {
    console.error(`[${timestamp()}] [WARN]  ${formatArgs(args)}`);
  },

  error(...args: unknown[]): void {
    console.error(`[${timestamp()}] [ERROR] ${formatArgs(args)}`);
  },

  tool(toolName: string, action: string, details?: unknown): void {
    const extra = details !== undefined ? ` ${JSON.stringify(details)}` : "";
    console.error(
      `[${timestamp()}] [TOOL]  ${toolName} — ${action}${extra}`,
    );
  },

  jmap(method: string, action: string, details?: unknown): void {
    const extra = details !== undefined ? ` ${JSON.stringify(details)}` : "";
    console.error(
      `[${timestamp()}] [JMAP]  ${method} — ${action}${extra}`,
    );
  },
};

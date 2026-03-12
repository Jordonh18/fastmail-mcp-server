# Copilot Instructions for Fastmail MCP Connector

## Project Overview

This is a Model Context Protocol (MCP) connector for Fastmail that enables AI assistants (like Claude) to interact with Fastmail accounts via the JMAP protocol. It provides tools for managing emails, calendars, contacts, and mailboxes.

## Architecture

- **Transport**: Uses stdio-based MCP server transport (`@modelcontextprotocol/sdk`)
- **Protocol**: JMAP (JSON Meta Application Protocol) for communicating with Fastmail
- **Language**: TypeScript with ESM modules (`"type": "module"`)

### Directory Structure

```
src/
├── index.ts          # Entry point - starts MCP server with stdio transport
├── server.ts         # Server factory - creates McpServer and registers all tools
├── jmap/
│   ├── client.ts     # JmapClient class - handles session, auth, and API requests
│   ├── methods.ts    # JMAP method call builders (pure functions)
│   └── types.ts      # TypeScript interfaces and JMAP capability constants
└── tools/
    ├── email-read.ts    # Email reading tools (search, get, unread, latest, mailbox)
    ├── email-write.ts   # Email writing tools (send, reply, forward, draft, send_draft)
    ├── email-manage.ts  # Email management tools (move, flags, delete, bulk, archive, mark_read)
    ├── mailbox.ts       # Mailbox CRUD tools
    ├── calendar.ts      # Calendar event tools
    ├── contacts.ts      # Contact card tools
    └── identity.ts      # Sender identity tools
```

## Coding Conventions

### Tool Registration Pattern

All tools follow this pattern:

```typescript
export function registerXxxTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "tool_name",
    "Human-readable description for AI to understand when to use this tool",
    {
      // Zod schema for parameters
      paramName: z.string().describe("Description of parameter"),
    },
    async ({ paramName }) => {
      const accountId = await client.getAccountId();
      // ... JMAP operations ...
      return {
        content: [{ type: "text", text: "Result message" }],
      };
    },
  );
}
```

### JMAP Method Builders

Method builders in `src/jmap/methods.ts` are pure functions that return `MethodCall` tuples:

```typescript
export function methodName(
  accountId: string,
  // ... params
  callId = "default.callid",
): MethodCall {
  return ["Method/name", { accountId, ...params }, callId];
}
```

### Error Handling

- JMAP-level errors are caught in `JmapClient.request()` and thrown as `Error`
- Tool-level errors use `throw new Error()` with descriptive messages
- Auth errors (401) clear the session cache and throw with guidance

### Caching

- `JmapClient` caches the JMAP session and account ID
- Tool modules cache frequently-used data (identities, mailbox IDs) in module-level variables
- Session cache is invalidated when the session state changes

## Testing

- **Framework**: Vitest (`npx vitest run`)
- **Test files**: Co-located with source as `*.test.ts` files
- **Pattern**: Mock `globalThis.fetch` for JMAP client tests; test pure functions directly
- **Test exclusion**: `tsconfig.json` excludes `*.test.ts` from production build

## Build & Run Commands

```bash
npm run build        # TypeScript compilation (tsc)
npm test             # Run tests (vitest run)
npm run test:watch   # Watch mode tests
npm run test:coverage # Tests with coverage
npm run typecheck    # Type check without emitting (tsc --noEmit)
npm run dev          # Watch mode build
```

## Key Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `zod` — Schema validation for tool parameters
- `vitest` — Testing framework (dev dependency)

## JMAP Capabilities

The connector uses these JMAP capability URIs:

- `urn:ietf:params:jmap:core` — Core JMAP
- `urn:ietf:params:jmap:mail` — Email operations
- `urn:ietf:params:jmap:submission` — Email sending
- `urn:ietf:params:jmap:calendars` — Calendar operations
- `urn:ietf:params:jmap:contacts` — Contact operations
- Fastmail-specific fallbacks for calendars and contacts

## Important Notes

- Always use `.js` extensions in import paths (ESM requirement)
- The API token is read from `FASTMAIL_API_TOKEN` environment variable
- All JMAP requests go through `JmapClient.request()` which handles auth, errors, and session management
- Tool return values must use `{ content: [{ type: "text", text: "..." }] }` format
- When adding new tools, register them in `src/server.ts`

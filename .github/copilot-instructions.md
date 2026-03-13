# Copilot Instructions for Fastmail MCP Server

## Project Overview

This is a Model Context Protocol (MCP) server for Fastmail that enables AI assistants to interact with Fastmail accounts via the JMAP protocol. It provides tools for managing emails, calendars, contacts, and mailboxes, including AI-powered features via MCP sampling.

Published as `@jordonh19/fastmail-mcp-server` on npm.

## Architecture

- **Transport**: Supports **stdio** (default) and **HTTP** transports (`@modelcontextprotocol/sdk`)
- **Protocol**: JMAP (JSON Meta Application Protocol) for communicating with Fastmail
- **Language**: TypeScript with ESM modules (`"type": "module"`)
- **Configuration**: File-based (`.fastmail-mcp.json`) with CLI arg overrides

### Directory Structure

```
src/
├── config.ts            # Configuration loader (file + CLI args)
├── config.test.ts       # Config tests
├── index.ts             # Entry point — stdio or HTTP transport
├── server.ts            # Server factory — creates McpServer, registers all tool groups
├── server.test.ts       # Server tests
├── jmap/
│   ├── client.ts        # JmapClient — session, auth, API requests, blob download
│   ├── client.test.ts   # Client tests
│   ├── methods.ts       # JMAP method call builders (pure functions)
│   ├── methods.test.ts  # Method builder tests
│   └── types.ts         # TypeScript interfaces and JMAP capability constants
└── tools/
    ├── email-helpers.ts    # Shared email utilities (formatting, HTML stripping, body extraction)
    ├── email-read.ts       # Email reading tools (search, get, thread, unread, latest, mailbox, download)
    ├── email-read.test.ts
    ├── email-write.ts      # Email composition tools (send, reply, forward, draft, send_draft)
    ├── email-write.test.ts
    ├── email-manage.ts     # Email management tools (move, flags, delete, bulk, archive, mark_read)
    ├── email-manage.test.ts
    ├── mailbox.ts          # Mailbox CRUD tools (list, create, rename, delete)
    ├── mailbox.test.ts
    ├── calendar.ts         # Calendar event tools (list, query, get, create, update, delete)
    ├── calendar.test.ts
    ├── contacts.ts         # Contact card tools (list, search, get, create, update, delete)
    ├── contacts.test.ts
    ├── identity.ts         # Sender identity tools (get_identities)
    ├── identity.test.ts
    ├── sampling.ts         # AI-powered tools via MCP sampling (summarize, suggest_reply)
    └── sampling.test.ts
```

### Tool Groups Registered in `server.ts`

| Group | Module | Tools |
|-------|--------|-------|
| Mailbox | `mailbox.ts` | `list_mailboxes`, `create_mailbox`, `rename_mailbox`, `delete_mailbox` |
| Identity | `identity.ts` | `get_identities` |
| Email Read | `email-read.ts` | `search_emails`, `get_email`, `get_thread`, `get_unread_emails`, `get_latest_emails`, `get_mailbox_emails`, `download_attachment` |
| Email Write | `email-write.ts` | `send_email`, `reply_email`, `forward_email`, `create_draft`, `send_draft` |
| Email Manage | `email-manage.ts` | `move_email`, `update_email_flags`, `delete_email`, `bulk_email_action`, `archive_email`, `mark_mailbox_read` |
| Calendar | `calendar.ts` | `list_calendars`, `get_calendar_events`, `get_calendar_event`, `create_calendar_event`, `update_calendar_event`, `delete_calendar_event` |
| Contacts | `contacts.ts` | `list_address_books`, `search_contacts`, `get_contact`, `create_contact`, `update_contact`, `delete_contact` |
| Sampling | `sampling.ts` | `summarize_email`, `suggest_reply` |

## Configuration

The server loads config from `src/config.ts`:

- **File config**: `.fastmail-mcp.json` in current directory or home directory
- **CLI args**: `--transport stdio|http`, `--port <number>`
- **Merge order**: Defaults → File → CLI (CLI wins)
- **Defaults**: transport = `stdio`, port = `3000`

HTTP mode: `node dist/index.js --transport http --port 3000`

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
      optionalParam: z.number().optional().default(20).describe("With default"),
    },
    async ({ paramName, optionalParam }) => {
      const accountId = await client.getAccountId();
      // ... JMAP operations ...
      return {
        content: [{ type: "text", text: "Result message" }],
      };
    },
  );
}
```

### Sampling Tools Pattern

Tools using MCP sampling check for client capability before proceeding:

```typescript
const caps = server.server.getClientCapabilities();
if (!caps?.sampling) {
  return { content: [{ type: "text", text: "Sampling not supported by client" }] };
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
- API tokens are always redacted from error messages

### Caching

- `JmapClient` caches the JMAP session and account ID
- Tool modules cache frequently-used data (identities, mailbox IDs) in module-level variables with a **5-minute TTL**
- Session cache is invalidated when the session state changes
- Email-write and email-manage modules cache Drafts/Sent/Trash/Archive mailbox IDs via role matching

### Email Helpers (`email-helpers.ts`)

Shared utilities used across email tool modules:

- `MAX_BODY_LENGTH = 50,000` — body truncation limit
- `formatAddress()` / `formatAddressList()` — address formatting
- `stripHtml()` — HTML to text conversion (removes scripts, styles)
- `getEmailBody()` — extracts text or HTML body with encoding handling
- `formatEmailSummary()` — formatted email preview with flags

## Testing

- **Framework**: Vitest 4.x (`npx vitest run`)
- **Coverage**: v8 provider, target **>70% line coverage** on `src/` (excluding `src/index.ts`)
- **Test files**: Co-located with source as `*.test.ts` files
- **Pattern**: Mock `globalThis.fetch` for JMAP client tests; test pure functions directly
- **Test exclusion**: `tsconfig.json` excludes `*.test.ts` from production build
- **Config**: `vitest.config.ts` — `globals: false`, `environment: "node"`, `passWithNoTests: false`

## Build & Run Commands

```bash
npm run build          # TypeScript compilation (tsc)
npm start              # Run the compiled server (node dist/index.js)
npm test               # Run tests (vitest run)
npm run test:watch     # Watch mode tests
npm run test:coverage  # Tests with v8 coverage
npm run typecheck      # Type check without emitting (tsc --noEmit)
npm run dev            # Watch mode build (tsc --watch)
npm run prepare        # Pre-install build hook (tsc)
```

## CI/CD & Deployment

### Workflows (`.github/workflows/`)

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **CI** | `ci.yml` | Push/PR to `main` | Matrix build & test (Node 18, 20, 22); strict type check |
| **Deep Testing** | `deep-testing.yml` | Push/PR to `main`, manual | Coverage (>70%), build integrity, dependency audit |
| **Release** | `release.yml` | Push to `main`, manual | Publishes to npm and creates a GitHub release when `package.json` has a new version |

### CI Pipeline (`ci.yml`)

- **Matrix**: Node 18 (typecheck only), Node 20 & 22 (typecheck + build + tests)
- **fail-fast**: disabled — all matrix legs run independently
- Separate **typecheck** job on Node 22 (strict)

### Deep Testing (`deep-testing.yml`)

- **test-coverage**: Coverage with v8, target >70% line coverage
- **build-integrity**: Clean build, verifies `dist/index.js` + `dist/server.js` exist, no test files in dist, entry point exports validated
- **dependency-audit**: `npm audit` and `npm outdated` (informational, non-blocking)

### Release Workflow (`release.yml`)

- **Branches**: `main` only
- **Version source**: the version in `package.json`
- **Behavior**: skips if the matching `v<version>` tag already exists
- **Publishing**: runs `npm publish --access public --provenance`, then creates a GitHub release with generated notes
- **Manual control**: contributors update the version themselves before merging or dispatching the workflow

## Key Dependencies

### Runtime

- `@modelcontextprotocol/sdk` ^1.27.0 — MCP server SDK
- `zod` ^3.23.0 — Schema validation for tool parameters

### Development

- `typescript` ^5.5.0
- `vitest` ^4.1.0 + `@vitest/coverage-v8` ^4.1.0

### Engine Requirement

- Node.js **>=18.0.0**

## JMAP Capabilities

The server uses these JMAP capability URIs (defined in `src/jmap/types.ts`):

- `urn:ietf:params:jmap:core` — Core JMAP
- `urn:ietf:params:jmap:mail` — Email operations
- `urn:ietf:params:jmap:submission` — Email sending
- `urn:ietf:params:jmap:calendars` — Calendar operations
- `urn:ietf:params:jmap:contacts` — Contact operations
- `https://www.fastmail.com/dev/calendars` — Fastmail calendar fallback
- `https://www.fastmail.com/dev/contacts` — Fastmail contacts fallback

Session endpoint: `https://api.fastmail.com/jmap/session`

## Important Notes

- Always use `.js` extensions in import paths (ESM requirement)
- The API token is read from `FASTMAIL_API_TOKEN` environment variable
- All JMAP requests go through `JmapClient.request()` which handles auth, errors, and session management
- Tool return values must use `{ content: [{ type: "text", text: "..." }] }` format
- When adding new tools, register them in `src/server.ts`
- Update `package.json` when preparing a release; the workflow publishes only when it sees a new version tag is needed
- Sampling tools (`summarize_email`, `suggest_reply`) require the connected MCP client to support the sampling capability
- Query results are capped: emails 20–100, events/contacts 50–100
- Image attachments are returned as base64 with MIME type; max download size is 10 MB

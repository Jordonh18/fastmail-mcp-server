# Fastmail MCP Server

A Model Context Protocol (MCP) server for Fastmail. Enables any MCP-compatible AI assistant to read, search, send, and manage emails, calendars, and contacts in a Fastmail account via the JMAP protocol.

## Prerequisites

- Node.js 18 or later
- A Fastmail account (Standard or Professional plan)
- A Fastmail API token with JMAP access

## Setup

### 1. Generate a Fastmail API Token

1. Log in to [Fastmail](https://www.fastmail.com)
2. Go to **Settings → Privacy & Security → Manage API tokens**
3. Click **New API token**
4. Grant access to **Mail**, **Calendars**, and **Contacts** (read and write)
5. Copy the generated token

### 2. Install

```bash
npm install @jordonh19/fastmail-mcp-server
```

Or run directly:

```bash
npx @jordonh19/fastmail-mcp-server
```

### 3. Configure

This MCP server works with any AI assistant that supports the Model Context Protocol. Below are examples for popular MCP clients.

#### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fastmail": {
      "command": "npx",
      "args": ["@jordonh19/fastmail-mcp-server"],
      "env": {
        "FASTMAIL_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

#### Claude Code CLI

```bash
export FASTMAIL_API_TOKEN="your-api-token-here"
claude mcp add fastmail -- npx @jordonh19/fastmail-mcp-server
```

#### Cursor

Add to your Cursor MCP configuration (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fastmail": {
      "command": "npx",
      "args": ["@jordonh19/fastmail-mcp-server"],
      "env": {
        "FASTMAIL_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

#### Windsurf

Add to your Windsurf MCP configuration (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "fastmail": {
      "command": "npx",
      "args": ["@jordonh19/fastmail-mcp-server"],
      "env": {
        "FASTMAIL_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

#### VS Code

Add to your VS Code MCP configuration (`.vscode/mcp.json`):

```json
{
  "servers": {
    "fastmail": {
      "command": "npx",
      "args": ["@jordonh19/fastmail-mcp-server"],
      "env": {
        "FASTMAIL_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

#### Other MCP Clients

For any MCP-compatible client, run the server with the `FASTMAIL_API_TOKEN` environment variable set:

```bash
FASTMAIL_API_TOKEN="your-api-token-here" npx @jordonh19/fastmail-mcp-server
```

The server communicates over stdio by default, following the standard MCP transport protocol. To run over HTTP instead, use the `--transport` flag:

```bash
FASTMAIL_API_TOKEN="your-api-token-here" npx @jordonh19/fastmail-mcp-server --transport http --port 3000
```

## Tools

### Email

- `search_emails`: Search emails by mailbox, text, sender, date range, attachments, and more.
- `get_email`: Get full email content by ID.
- `get_thread`: Get all emails in a conversation thread.
- `get_unread_emails`: Quickly retrieve unread emails, optionally filtered by mailbox.
- `get_latest_emails`: Get the most recent emails from all or a specific mailbox.
- `get_mailbox_emails`: List emails in a specific mailbox with pagination.
- `get_email_attachments`: List attachments on an email without returning the full message body.
- `send_email`: Compose and send a new email.
- `reply_email`: Reply or reply-all to an email.
- `forward_email`: Forward an email to new recipients.
- `create_draft`: Save an email as a draft without sending.
- `send_draft`: Send a previously saved draft email.
- `move_email`: Move an email to a different mailbox.
- `add_labels`: Add mailbox labels to an email while preserving existing mailbox assignments.
- `remove_labels`: Remove mailbox labels from an email while preserving other mailbox assignments.
- `update_email_flags`: Mark emails as read/unread or flagged/unflagged.
- `delete_email`: Move to Trash or permanently delete.
- `bulk_email_action`: Perform actions on multiple emails at once.
- `bulk_add_labels`: Add mailbox labels to multiple emails at once.
- `bulk_remove_labels`: Remove mailbox labels from multiple emails at once.
- `archive_email`: Move one or more emails to the Archive mailbox.
- `mark_mailbox_read`: Mark all emails in a mailbox as read.
- `get_mailbox_stats`: Get compact mailbox-level unread, email, and thread counts.
- `get_account_summary`: Get a compact account overview with unique email totals and top mailboxes.
- `download_attachment`: Download an email attachment by blob ID.

### Mailbox

- `list_mailboxes`: List all mailboxes or folders with roles and email counts.
- `create_mailbox`: Create a new mailbox or folder.
- `rename_mailbox`: Rename an existing mailbox or folder.
- `delete_mailbox`: Delete a mailbox or folder, optionally with force delete.

### Calendar

- `list_calendars`: List all calendars with names, colors, and visibility.
- `get_calendar_events`: Search or list calendar events by date range, calendar, or title.
- `get_calendar_event`: Get full details of a specific calendar event.
- `create_calendar_event`: Create a new calendar event with location, participants, and alerts.
- `update_calendar_event`: Update an existing calendar event.
- `delete_calendar_event`: Delete a calendar event.

### Contacts

- `list_address_books`: List all address books or contact groups.
- `search_contacts`: Search contacts by name, email, or other criteria.
- `get_contact`: Get full details of a specific contact.
- `create_contact`: Create a new contact with email, phone, organization, and more.
- `update_contact`: Update an existing contact's information.
- `delete_contact`: Delete a contact.

### Identity

- `get_identities`: List available sender identities.

### Diagnostics

- `check_function_availability`: Check which Fastmail feature groups and MCP client capabilities are available, with setup guidance for missing access.

## Transport Modes

The server supports two transport modes:

### stdio (default)

Standard input/output transport. Used by most MCP clients (Claude Desktop, Cursor, VS Code, etc.):

```bash
FASTMAIL_API_TOKEN="your-token" npx @jordonh19/fastmail-mcp-server
```

### HTTP (Streamable HTTP)

Runs as an HTTP server for remote access or multi-client scenarios:

```bash
FASTMAIL_API_TOKEN="your-token" npx @jordonh19/fastmail-mcp-server --transport http --port 3000
```

The HTTP transport exposes a single `/mcp` endpoint that supports the MCP Streamable HTTP protocol.

### Web UI Dashboard

When running in HTTP mode, a built-in web dashboard is available at the server root. It provides:

- **Live tool-call log** — see every MCP tool invocation in real time via SSE
- **Connection tracking** — monitor active MCP client connections
- **Server uptime** — at-a-glance health status

On startup the server prints a one-time access token to the console. Open `http://localhost:<port>/` in a browser and enter the token to log in. The token is bound to an HttpOnly cookie so it never appears in URLs.

## Claude Desktop Extension (DXT)

A pre-packaged `.dxt` extension can be built for one-click installation in Claude Desktop:

```bash
npm run build:dxt
```

This produces `fastmail-mcp-server-v<version>.dxt` in the project root. Double-click the file (or drag it into Claude Desktop) to install. Claude will prompt for your Fastmail API token on first use.

## Configuration

The server can be configured via environment variables or a JSON config file.

### Environment Variables

- `FASTMAIL_API_TOKEN`: Required. Fastmail API token with JMAP access.

### Config File

Create a `.fastmail-mcp.json` file in your project root or home directory:

```json
{
  "transport": "stdio",
  "port": 3000
}
```

The server searches for config files in this order:

1. `./.fastmail-mcp.json` (current directory)
2. `~/.fastmail-mcp.json` (home directory)

Environment variables and CLI flags always take precedence over config file values.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

```bash
git clone https://github.com/Jordonh18/fastmail-mcp-server.git
cd fastmail-mcp-server
npm install
npm run build
npm test
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | TypeScript compilation |
| `npm run build:dxt` | Build + package as a Claude Desktop `.dxt` extension |
| `npm run dev` | Watch mode build |
| `npm test` | Run tests (Vitest) |
| `npm run test:coverage` | Tests with v8 coverage |
| `npm run typecheck` | Type check without emitting |

Run locally:

```bash
FASTMAIL_API_TOKEN="your-token" node dist/index.js
```

## License

MIT

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
npm install @jordonh18/fastmail-mcp-server
```

Or run directly:

```bash
npx @jordonh18/fastmail-mcp-server
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
      "args": ["@jordonh18/fastmail-mcp-server"],
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
claude mcp add fastmail -- npx @jordonh18/fastmail-mcp-server
```

#### Cursor

Add to your Cursor MCP configuration (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fastmail": {
      "command": "npx",
      "args": ["@jordonh18/fastmail-mcp-server"],
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
      "args": ["@jordonh18/fastmail-mcp-server"],
      "env": {
        "FASTMAIL_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

#### VS Code with GitHub Copilot

Add to your VS Code settings (`.vscode/mcp.json`):

```json
{
  "servers": {
    "fastmail": {
      "command": "npx",
      "args": ["@jordonh18/fastmail-mcp-server"],
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
FASTMAIL_API_TOKEN="your-api-token-here" npx @jordonh18/fastmail-mcp-server
```

The server communicates over stdio by default, following the standard MCP transport protocol. To run over HTTP instead, use the `--transport` flag:

```bash
FASTMAIL_API_TOKEN="your-api-token-here" npx @jordonh18/fastmail-mcp-server --transport http --port 3000
```

## Tools

### Email

| Tool | Description |
|------|-------------|
| `search_emails` | Search emails by mailbox, text, sender, date range, attachments, etc. |
| `get_email` | Get full email content by ID |
| `get_thread` | Get all emails in a conversation thread |
| `get_unread_emails` | Quickly retrieve unread emails, optionally filtered by mailbox |
| `get_latest_emails` | Get the most recent emails from all or a specific mailbox |
| `get_mailbox_emails` | List emails in a specific mailbox with pagination |
| `send_email` | Compose and send a new email |
| `reply_email` | Reply or reply-all to an email |
| `forward_email` | Forward an email to new recipients |
| `create_draft` | Save an email as a draft without sending |
| `send_draft` | Send a previously saved draft email |
| `move_email` | Move an email to a different mailbox |
| `update_email_flags` | Mark emails as read/unread or flagged/unflagged |
| `delete_email` | Move to Trash or permanently delete |
| `bulk_email_action` | Perform actions on multiple emails at once (mark read/unread, flag, move, delete) |
| `archive_email` | Move one or more emails to the Archive mailbox |
| `mark_mailbox_read` | Mark all emails in a mailbox as read |
| `download_attachment` | Download an email attachment by blob ID |

### Mailbox

| Tool | Description |
|------|-------------|
| `list_mailboxes` | List all mailboxes/folders with roles and email counts |
| `create_mailbox` | Create a new mailbox/folder |
| `rename_mailbox` | Rename an existing mailbox/folder |
| `delete_mailbox` | Delete a mailbox/folder (with optional force delete) |

### Calendar

| Tool | Description |
|------|-------------|
| `list_calendars` | List all calendars with names, colors, and visibility |
| `get_calendar_events` | Search/list calendar events by date range, calendar, or title |
| `get_calendar_event` | Get full details of a specific calendar event |
| `create_calendar_event` | Create a new calendar event with location, participants, and alerts |
| `update_calendar_event` | Update an existing calendar event |
| `delete_calendar_event` | Delete a calendar event |

### Contacts

| Tool | Description |
|------|-------------|
| `list_address_books` | List all address books (contact groups) |
| `search_contacts` | Search contacts by name, email, or other criteria |
| `get_contact` | Get full details of a specific contact |
| `create_contact` | Create a new contact with email, phone, organization, etc. |
| `update_contact` | Update an existing contact's information |
| `delete_contact` | Delete a contact |

### Identity

| Tool | Description |
|------|-------------|
| `get_identities` | List available sender identities |

## Transport Modes

The server supports two transport modes:

### stdio (default)

Standard input/output transport. Used by most MCP clients (Claude Desktop, Cursor, VS Code, etc.):

```bash
FASTMAIL_API_TOKEN="your-token" npx @jordonh18/fastmail-mcp-server
```

### HTTP (Streamable HTTP)

Runs as an HTTP server for remote access or multi-client scenarios:

```bash
FASTMAIL_API_TOKEN="your-token" npx @jordonh18/fastmail-mcp-server --transport http --port 3000
```

The HTTP transport exposes a single `/mcp` endpoint that supports the MCP Streamable HTTP protocol.

## Configuration

The server can be configured via environment variables or a JSON config file.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FASTMAIL_API_TOKEN` | Yes | Fastmail API token with JMAP access |

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
git clone https://github.com/Jordonh18/claude-fastmail-connector.git
cd claude-fastmail-connector
npm install
npm run build
npm test
```

Run locally:

```bash
FASTMAIL_API_TOKEN="your-token" node dist/index.js
```

## License

MIT

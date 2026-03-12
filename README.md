# Fastmail MCP Connector

MCP connector for Fastmail. Enables Claude to read, search, send, and manage emails, calendars, and contacts in a Fastmail account via the JMAP protocol.

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
npm install @jordonh18/fastmail-connector
```

Or run directly:

```bash
npx @jordonh18/fastmail-connector
```

### 3. Configure

#### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fastmail": {
      "command": "npx",
      "args": ["@jordonh18/fastmail-connector"],
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
claude --mcp-server "npx @jordonh18/fastmail-connector"
```

## Tools

### Email

| Tool | Description |
|------|-------------|
| `search_emails` | Search emails by mailbox, text, sender, date range, etc. |
| `get_email` | Get full email content by ID |
| `get_thread` | Get all emails in a conversation thread |
| `send_email` | Compose and send a new email |
| `reply_email` | Reply or reply-all to an email |
| `forward_email` | Forward an email to new recipients |
| `create_draft` | Save an email as a draft without sending |
| `move_email` | Move an email to a different mailbox |
| `update_email_flags` | Mark emails as read/unread or flagged/unflagged |
| `delete_email` | Move to Trash or permanently delete |
| `bulk_email_action` | Perform actions on multiple emails at once (mark read/unread, flag, move, delete) |

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
| `delete_contact` | Delete a contact |

### Identity

| Tool | Description |
|------|-------------|
| `get_identities` | List available sender identities |

## Development

```bash
git clone https://github.com/jordonh18/claude-fastmail-connector.git
cd claude-fastmail-connector
npm install
npm run build
```

Run locally:

```bash
FASTMAIL_API_TOKEN="your-token" node dist/index.js
```

## License

MIT

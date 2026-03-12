# Fastmail MCP Connector

MCP connector for Fastmail. Enables Claude to read, search, send, and manage emails in a Fastmail account via the JMAP protocol.

## Prerequisites

- Node.js 18 or later
- A Fastmail account (Standard or Professional plan)
- A Fastmail API token with JMAP access

## Setup

### 1. Generate a Fastmail API Token

1. Log in to [Fastmail](https://www.fastmail.com)
2. Go to **Settings → Privacy & Security → Manage API tokens**
3. Click **New API token**
4. Grant access to **Mail** (read and write)
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

| Tool | Description |
|------|-------------|
| `list_mailboxes` | List all mailboxes/folders with roles and email counts |
| `create_mailbox` | Create a new mailbox/folder |
| `search_emails` | Search emails by mailbox, text, sender, date range, etc. |
| `get_email` | Get full email content by ID |
| `get_thread` | Get all emails in a conversation thread |
| `send_email` | Compose and send a new email |
| `reply_email` | Reply or reply-all to an email |
| `forward_email` | Forward an email to new recipients |
| `move_email` | Move an email to a different mailbox |
| `update_email_flags` | Mark emails as read/unread or flagged/unflagged |
| `delete_email` | Move to Trash or permanently delete |
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

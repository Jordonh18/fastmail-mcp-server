# Contributing to Fastmail MCP Server

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- A Fastmail account with an API token (for manual testing)

### Getting Started

```bash
git clone https://github.com/Jordonh18/fastmail-mcp-server.git
cd fastmail-mcp-server
npm install
npm run build
```

### Running Tests

```bash
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
```

### Type Checking

```bash
npm run typecheck       # Type check without emitting files
```

### Development Mode

```bash
npm run dev             # Watch mode — rebuilds on file changes
```

## Project Structure

```
src/
├── index.ts              # Entry point — starts MCP server with transport
├── server.ts             # Server factory — creates McpServer and registers tools
├── jmap/
│   ├── client.ts         # JmapClient — handles session, auth, and API requests
│   ├── methods.ts        # JMAP method call builders (pure functions)
│   └── types.ts          # TypeScript interfaces and JMAP capability constants
└── tools/
    ├── email-read.ts     # Email reading tools (search, get, unread, latest)
    ├── email-write.ts    # Email writing tools (send, reply, forward, draft)
    ├── email-manage.ts   # Email management tools (move, flags, delete, bulk)
    ├── mailbox.ts        # Mailbox CRUD tools
    ├── calendar.ts       # Calendar event tools
    ├── contacts.ts       # Contact card tools
    └── identity.ts       # Sender identity tools
```

## Coding Conventions

### Tool Registration

All MCP tools follow this pattern:

```typescript
export function registerXxxTools(server: McpServer, client: JmapClient): void {
  server.tool(
    "tool_name",
    "Human-readable description for the AI to understand when to use this tool",
    {
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
  callId = "default.callid",
): MethodCall {
  return ["Method/name", { accountId }, callId];
}
```

### Testing

- Test files are co-located with source files as `*.test.ts`
- Use Vitest as the testing framework
- Mock `globalThis.fetch` for JMAP client tests
- Test pure functions directly without mocks

### Style

- Use TypeScript strict mode
- Use ESM modules (`.js` extensions in import paths)
- Use `zod` for parameter validation
- Tool return values use `{ content: [{ type: "text", text: "..." }] }` format

## Adding a New Tool

1. Choose the appropriate file in `src/tools/` (or create a new one)
2. Add a new `server.tool()` call following the pattern above
3. If creating a new tool file, register it in `src/server.ts`
4. Add tests in a co-located `*.test.ts` file
5. Update the tool table in `README.md`

## Adding New JMAP Methods

1. Add the method builder function to `src/jmap/methods.ts`
2. Add any new TypeScript types to `src/jmap/types.ts`
3. Add tests in `src/jmap/methods.test.ts`

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and add tests
4. Ensure all tests pass (`npm test`)
5. Ensure type checking passes (`npm run typecheck`)
6. Commit your changes with a descriptive message
7. Push to your fork and open a Pull Request

## Reporting Issues

When reporting bugs, please include:

- Node.js version (`node --version`)
- Steps to reproduce the issue
- Expected vs actual behavior
- Any error messages or logs

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

#!/usr/bin/env node

import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer();

  if (config.transport === "http") {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const httpServer = createHttpServer((req, res) => {
      if (req.url === "/mcp") {
        transport.handleRequest(req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    await server.connect(transport);

    httpServer.listen(config.port, () => {
      console.error(`Fastmail MCP server listening on http://localhost:${config.port}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  process.exit(0);
});

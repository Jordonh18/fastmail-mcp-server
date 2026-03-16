#!/usr/bin/env node

import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";
import {
  getWebUiToken,
  handleWebUiRequest,
  trackMcpConnect,
  trackMcpDisconnect,
} from "./web-ui.js";

async function main(): Promise<void> {
  log.info("Fastmail MCP server starting...");
  log.info(`Node.js ${process.version}, platform: ${process.platform}, arch: ${process.arch}`);
  log.info(`PID: ${process.pid}`);

  const config = loadConfig();
  log.info(`Config loaded — transport: ${config.transport}, port: ${config.port}`);

  const server = createServer();
  log.info("MCP server instance created");

  if (config.transport === "http") {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    let connCounter = 0;

    const httpServer = createHttpServer((req, res) => {
      const pathname = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      ).pathname;

      if (pathname === "/mcp") {
        // Browser GET without text/event-stream → serve web UI instead of
        // returning "Not Acceptable"
        if (
          req.method === "GET" &&
          !(req.headers.accept ?? "").includes("text/event-stream")
        ) {
          handleWebUiRequest(req, res);
          return;
        }

        log.debug(`HTTP ${req.method} /mcp from ${req.socket.remoteAddress}`);

        const connId = String(++connCounter);
        trackMcpConnect(connId);
        res.on("close", () => trackMcpDisconnect(connId));

        transport.handleRequest(req, res);
      } else {
        // All other paths are handled by the web UI
        handleWebUiRequest(req, res);
      }
    });

    await server.connect(transport);
    log.info("MCP server connected to HTTP transport");

    log.info(
      `Web UI access token: ${getWebUiToken()}`,
    );

    httpServer.listen(config.port, () => {
      log.info(`HTTP server listening on http://localhost:${config.port}/mcp`);
      log.info(`Web UI available at http://localhost:${config.port}/`);
    });
  } else {
    log.info("Connecting via stdio transport...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log.info("MCP server connected to stdio transport — ready for requests");
  }
}

main().catch((error) => {
  log.error("Fatal error:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  log.info("Received SIGINT — shutting down");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log.info("Received SIGTERM — shutting down");
  process.exit(0);
});

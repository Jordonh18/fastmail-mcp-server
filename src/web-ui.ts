/**
 * Lightweight companion web UI for the Fastmail MCP server.
 *
 * Assumptions / design notes:
 *  - Serves a single-page dashboard at "/" (or any non-MCP path) over the
 *    same HTTP port the MCP transport already listens on.
 *  - Auth: ephemeral random token printed to the terminal on startup.
 *    Token is validated via POST /ui-login and stored in an HttpOnly cookie.
 *  - Live updates: SSE stream at /ui-events pushes tool-call and connection
 *    events to the browser.
 *  - Tool call log: in-memory circular buffer of the last 50 calls, populated
 *    by wrapping McpServer.tool() handlers (see server.ts).
 *  - No new npm dependencies — uses node:crypto and node:http built-ins.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { log } from "./logger.js";

// ---------------------------------------------------------------------------
// Tool-call circular buffer
// ---------------------------------------------------------------------------

export interface ToolCallEntry {
  timestamp: string;
  toolName: string;
  input: string;
  success: boolean;
  error?: string;
}

const BUFFER_SIZE = 50;
const toolCallEntries: ToolCallEntry[] = [];

export function recordToolCall(
  toolName: string,
  input: unknown,
  success: boolean,
  error?: unknown,
): void {
  const entry: ToolCallEntry = {
    timestamp: new Date().toISOString(),
    toolName,
    input: abbreviate(input),
    success,
    error:
      error instanceof Error ? error.message : error ? String(error) : undefined,
  };

  if (toolCallEntries.length >= BUFFER_SIZE) {
    toolCallEntries.shift();
  }
  toolCallEntries.push(entry);

  broadcastEvent("tool-call", entry);
}

function abbreviate(input: unknown): string {
  if (input === undefined || input === null) return "";
  const str = typeof input === "string" ? input : JSON.stringify(input);
  return str.length > 120 ? str.slice(0, 117) + "..." : str;
}

// ---------------------------------------------------------------------------
// MCP connection tracking
// ---------------------------------------------------------------------------

let mcpActiveConnections = 0;
let mcpTotalRequests = 0;
const mcpConnectionTimes = new Map<string, number>();

export function trackMcpConnect(id: string): void {
  mcpActiveConnections++;
  mcpTotalRequests++;
  mcpConnectionTimes.set(id, Date.now());
  broadcastConnectionUpdate();
}

export function trackMcpDisconnect(id: string): void {
  mcpActiveConnections = Math.max(0, mcpActiveConnections - 1);
  mcpConnectionTimes.delete(id);
  broadcastConnectionUpdate();
}

function broadcastConnectionUpdate(): void {
  broadcastEvent("connection-update", {
    activeConnections: mcpActiveConnections,
    totalRequests: mcpTotalRequests,
    connections: buildConnectionList(),
  });
}

function buildConnectionList() {
  return Array.from(mcpConnectionTimes.entries()).map(([id, time]) => ({
    id,
    connectedAt: new Date(time).toISOString(),
    durationMs: Date.now() - time,
  }));
}

// ---------------------------------------------------------------------------
// SSE clients for /ui-events
// ---------------------------------------------------------------------------

const uiSseClients = new Set<ServerResponse>();

function broadcastEvent(eventName: string, data: unknown): void {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of uiSseClients) {
    try {
      client.write(payload);
    } catch {
      uiSseClients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// Auth — ephemeral token
// ---------------------------------------------------------------------------

const webUiToken = randomBytes(24).toString("hex");

export function getWebUiToken(): string {
  return webUiToken;
}

function parseCookies(req: IncomingMessage): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = req.headers.cookie;
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return cookies;
}

function isAuthenticated(req: IncomingMessage): boolean {
  const cookies = parseCookies(req);
  const value = cookies.get("mcp_ui_session");
  if (!value || value.length !== webUiToken.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(webUiToken));
}

// ---------------------------------------------------------------------------
// Server start time
// ---------------------------------------------------------------------------

const serverStartTime = Date.now();

// ---------------------------------------------------------------------------
// HTTP request handler (called for all non-MCP paths)
// ---------------------------------------------------------------------------

export function handleWebUiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const pathname = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  ).pathname;

  // Login endpoint — no auth required
  if (pathname === "/ui-login" && req.method === "POST") {
    handleLogin(req, res);
    return;
  }

  // All other web UI routes require auth
  if (!isAuthenticated(req)) {
    if (pathname === "/ui-events" || pathname === "/ui-status") {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }
    serveLoginPage(res);
    return;
  }

  if (pathname === "/ui-events") {
    handleSseStream(req, res);
  } else if (pathname === "/ui-status") {
    handleStatusApi(res);
  } else {
    serveDashboard(res);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleLogin(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
    if (body.length > 4096) {
      res.writeHead(413);
      res.end("Payload too large");
      req.destroy();
    }
  });
  req.on("end", () => {
    const params = new URLSearchParams(body);
    const token = params.get("token") ?? "";

    if (
      token.length === webUiToken.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(webUiToken))
    ) {
      res.writeHead(302, {
        "Set-Cookie": `mcp_ui_session=${webUiToken}; HttpOnly; SameSite=Strict; Path=/`,
        Location: "/",
      });
      res.end();
    } else {
      res.writeHead(401, { "Content-Type": "text/html" });
      res.end(loginPageHtml("Invalid token. Please try again."));
    }
  });
}

function handleSseStream(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send full current state on connect
  res.write(`event: init\ndata: ${JSON.stringify(getStatus())}\n\n`);

  uiSseClients.add(res);
  req.on("close", () => {
    uiSseClients.delete(res);
  });
}

function handleStatusApi(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(getStatus()));
}

function getStatus() {
  const uptimeMs = Date.now() - serverStartTime;
  return {
    uptime: formatUptime(uptimeMs),
    uptimeMs,
    activeConnections: mcpActiveConnections,
    totalRequests: mcpTotalRequests,
    connections: buildConnectionList(),
    toolCalls: [...toolCallEntries],
  };
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function serveLoginPage(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(loginPageHtml());
}

function loginPageHtml(errorMsg?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fastmail MCP — Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}
.box{background:#16213e;padding:2rem;border-radius:8px;width:100%;max-width:400px}
h1{font-size:1.2rem;margin-bottom:1rem;color:#4ecca3}
.err{color:#e74c3c;margin-bottom:1rem;font-size:.9rem}
label{display:block;margin-bottom:.3rem;font-size:.9rem}
input[type=text]{width:100%;padding:.5rem;border:1px solid #333;border-radius:4px;background:#0f3460;color:#e0e0e0;font-family:monospace;font-size:.95rem;margin-bottom:1rem}
button{background:#4ecca3;color:#1a1a2e;border:none;padding:.5rem 1.5rem;border-radius:4px;cursor:pointer;font-weight:bold}
button:hover{background:#3ba88a}
.hint{font-size:.8rem;color:#888;margin-top:1rem}
</style>
</head>
<body>
<div class="box">
<h1>Fastmail MCP Server</h1>
${errorMsg ? `<div class="err">${escapeHtml(errorMsg)}</div>` : ""}
<form method="POST" action="/ui-login">
<label for="token">Access Token</label>
<input type="text" id="token" name="token" autocomplete="off" autofocus required>
<button type="submit">Log In</button>
</form>
<p class="hint">Token is printed to the server terminal on startup.</p>
</div>
</body>
</html>`;
}

function serveDashboard(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(dashboardHtml());
}

function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fastmail MCP Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;padding:1.5rem}
h1{color:#4ecca3;margin-bottom:.3rem;font-size:1.3rem}
.sub{color:#888;font-size:.85rem;margin-bottom:1.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1.5rem}
.card{background:#16213e;padding:1rem;border-radius:6px}
.card h2{font-size:.8rem;color:#888;margin-bottom:.25rem;text-transform:uppercase;letter-spacing:.04em}
.card .val{font-size:1.4rem;font-weight:bold;color:#4ecca3}
h3{font-size:1rem;margin-bottom:.5rem;color:#4ecca3}
.section{background:#16213e;border-radius:6px;padding:1rem;margin-bottom:1.5rem}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{text-align:left;color:#888;border-bottom:1px solid #333;padding:.4rem .6rem;font-weight:600}
td{padding:.4rem .6rem;border-bottom:1px solid #222;vertical-align:top}
.ok{color:#4ecca3}
.err{color:#e74c3c}
.mono{font-family:monospace;font-size:.8rem}
.inp{max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aaa}
.empty{color:#666;font-style:italic;padding:1rem}
.clients div{padding:.3rem 0;border-bottom:1px solid #222;font-size:.85rem}
</style>
</head>
<body>
<h1>Fastmail MCP Server</h1>
<p class="sub">Dashboard &mdash; live status and tool call log</p>

<div class="grid">
<div class="card"><h2>Status</h2><div class="val" id="status">Running</div></div>
<div class="card"><h2>Uptime</h2><div class="val" id="uptime">&mdash;</div></div>
<div class="card"><h2>Active Connections</h2><div class="val" id="conns">0</div></div>
<div class="card"><h2>Total Requests</h2><div class="val" id="reqs">0</div></div>
</div>

<div class="section">
<h3>Connected Clients</h3>
<div id="cl" class="clients"><div class="empty">No active clients</div></div>
</div>

<div class="section">
<h3>Tool Call Log <span style="color:#666;font-size:.8rem">(last 50)</span></h3>
<table>
<thead><tr><th>Time</th><th>Tool</th><th>Input</th><th>Result</th></tr></thead>
<tbody id="lb"><tr><td colspan="4" class="empty">No tool calls yet</td></tr></tbody>
</table>
</div>

<script>
(function(){
var lb=document.getElementById("lb"),
    up=document.getElementById("uptime"),
    cn=document.getElementById("conns"),
    rq=document.getElementById("reqs"),
    cl=document.getElementById("cl"),
    st=document.getElementById("status"),
    entries=[],uptimeMs=0,lastT=Date.now();

function fmtUp(ms){
  var s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
  if(d>0)return d+"d "+(h%24)+"h "+(m%60)+"m";
  if(h>0)return h+"h "+(m%60)+"m "+(s%60)+"s";
  if(m>0)return m+"m "+(s%60)+"s";
  return s+"s";
}
function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML}
function renderLog(){
  if(!entries.length){lb.innerHTML='<tr><td colspan="4" class="empty">No tool calls yet</td></tr>';return}
  lb.innerHTML=entries.slice().reverse().map(function(e){
    var t=new Date(e.timestamp).toLocaleTimeString(),
        c=e.success?"ok":"err",
        r=e.success?"OK":esc(e.error||"Error");
    return '<tr><td class="mono">'+esc(t)+'</td><td>'+esc(e.toolName)+'</td><td class="inp mono" title="'+esc(e.input)+'">'+esc(e.input)+'</td><td class="'+c+'">'+r+'</td></tr>';
  }).join("");
}
function renderCl(conns){
  if(!conns||!conns.length){cl.innerHTML='<div class="empty">No active clients</div>';return}
  cl.innerHTML=conns.map(function(c){return '<div>Client '+esc(c.id)+' &mdash; connected '+fmtUp(c.durationMs)+' ago</div>'}).join("");
}
setInterval(function(){var n=Date.now();uptimeMs+=n-lastT;lastT=n;up.textContent=fmtUp(uptimeMs)},1000);

var es=new EventSource("/ui-events");
es.addEventListener("init",function(e){
  var d=JSON.parse(e.data);
  uptimeMs=d.uptimeMs;lastT=Date.now();
  cn.textContent=d.activeConnections;rq.textContent=d.totalRequests;
  entries=d.toolCalls||[];renderLog();renderCl(d.connections);
});
es.addEventListener("tool-call",function(e){
  var entry=JSON.parse(e.data);entries.push(entry);
  if(entries.length>50)entries.shift();renderLog();
});
es.addEventListener("connection-update",function(e){
  var d=JSON.parse(e.data);
  cn.textContent=d.activeConnections;rq.textContent=d.totalRequests;
  renderCl(d.connections);
});
es.onerror=function(){st.textContent="Disconnected";st.style.color="#e74c3c"};
})();
</script>
</body>
</html>`;
}

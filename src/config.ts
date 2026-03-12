import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Config {
  transport: "stdio" | "http";
  port: number;
}

const DEFAULT_CONFIG: Config = {
  transport: "stdio",
  port: 3000,
};

const CONFIG_FILENAME = ".fastmail-mcp.json";

function loadConfigFile(): Partial<Config> {
  const paths = [
    join(process.cwd(), CONFIG_FILENAME),
    join(homedir(), CONFIG_FILENAME),
  ];

  for (const filePath of paths) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<Config>;
      return parsed;
    } catch {
      // File not found or invalid — try next location
    }
  }

  return {};
}

function parseCliArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const result: Partial<Config> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--transport" && args[i + 1]) {
      const value = args[i + 1];
      if (value === "stdio" || value === "http") {
        result.transport = value;
      }
      i++;
    } else if (args[i] === "--port" && args[i + 1]) {
      const port = parseInt(args[i + 1], 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        result.port = port;
      }
      i++;
    }
  }

  return result;
}

export function loadConfig(): Config {
  const fileConfig = loadConfigFile();
  const cliConfig = parseCliArgs();

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...cliConfig,
  };
}

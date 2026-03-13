import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { loadConfig } from "./config.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

const mockedReadFileSync = vi.mocked(readFileSync);

describe("loadConfig", () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
    process.argv = ["node", "index.js"];
    mockedReadFileSync.mockReset();
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("returns default config when no file or CLI args", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const config = loadConfig();
    expect(config.transport).toBe("stdio");
    expect(config.port).toBe(3000);
  });

  it("loads config from file", () => {
    mockedReadFileSync.mockImplementation((path) => {
      if (typeof path === "string" && path.includes(".fastmail-mcp.json")) {
        return JSON.stringify({ transport: "http", port: 8080 });
      }
      throw new Error("ENOENT");
    });

    const config = loadConfig();
    expect(config.transport).toBe("http");
    expect(config.port).toBe(8080);
  });

  it("CLI args override file config", () => {
    mockedReadFileSync.mockImplementation((path) => {
      if (typeof path === "string" && path.includes(".fastmail-mcp.json")) {
        return JSON.stringify({ transport: "http", port: 8080 });
      }
      throw new Error("ENOENT");
    });
    process.argv = ["node", "index.js", "--transport", "stdio", "--port", "4000"];

    const config = loadConfig();
    expect(config.transport).toBe("stdio");
    expect(config.port).toBe(4000);
  });

  it("parses --transport flag", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    process.argv = ["node", "index.js", "--transport", "http"];

    const config = loadConfig();
    expect(config.transport).toBe("http");
  });

  it("parses --port flag", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    process.argv = ["node", "index.js", "--port", "9090"];

    const config = loadConfig();
    expect(config.port).toBe(9090);
  });

  it("ignores invalid transport values", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    process.argv = ["node", "index.js", "--transport", "invalid"];

    const config = loadConfig();
    expect(config.transport).toBe("stdio");
  });

  it("ignores invalid port values", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    process.argv = ["node", "index.js", "--port", "notanumber"];

    const config = loadConfig();
    expect(config.port).toBe(3000);
  });

  it("skips invalid JSON in config file", () => {
    mockedReadFileSync.mockImplementation((path) => {
      if (typeof path === "string" && path.includes(".fastmail-mcp.json")) {
        return "not valid json{{{";
      }
      throw new Error("ENOENT");
    });

    const config = loadConfig();
    expect(config.transport).toBe("stdio");
    expect(config.port).toBe(3000);
  });
});

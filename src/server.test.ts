import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "./server.js";

describe("createServer", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.FASTMAIL_API_TOKEN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FASTMAIL_API_TOKEN = originalEnv;
    } else {
      delete process.env.FASTMAIL_API_TOKEN;
    }
  });

  it("throws when FASTMAIL_API_TOKEN is not set", () => {
    delete process.env.FASTMAIL_API_TOKEN;
    expect(() => createServer()).toThrow("FASTMAIL_API_TOKEN");
  });

  it("creates server when API token is set", () => {
    process.env.FASTMAIL_API_TOKEN = "test-token";
    const server = createServer();
    expect(server).toBeDefined();
  });

  it("error message includes guidance on generating a token", () => {
    delete process.env.FASTMAIL_API_TOKEN;
    expect(() => createServer()).toThrow("Manage API tokens");
  });
});

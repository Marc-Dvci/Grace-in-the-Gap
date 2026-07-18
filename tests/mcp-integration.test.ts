import type { Server } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";
import { startContractServer } from "./helpers/contract-server.js";

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

function environment(extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extra }).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    })
  );
}

describe("MCP server", () => {
  it("advertises controls and returns a live moment over stdio", async () => {
    const contract = await startContractServer();
    server = contract.server;
    const dataDirectory = await mkdtemp(join(tmpdir(), "grace-mcp-test-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        resolve("node_modules", "tsx", "dist", "cli.mjs"),
        resolve("src", "mcp", "server.ts")
      ],
      env: environment({
        GRACE_DATA_DIR: dataDirectory,
        GLOO_CLIENT_ID: "contract-client",
        GLOO_CLIENT_SECRET: "contract-secret",
        GLOO_BASE_URL: contract.baseUrl,
        YVP_APP_KEY: "contract-app-key",
        YOUVERSION_BASE_URL: contract.baseUrl
      })
    });
    const client = new Client({ name: "grace-test-client", version: "0.1.0" });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
        "configure_grace", "grace_moment", "grace_status"
      ]);
      const result = await client.callTool({
        name: "grace_moment",
        arguments: { taskType: "testing", locale: "en-US" }
      });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain("Grace in the Gap");
      expect(JSON.stringify(result.content)).toContain("GLOO + YOUVERSION");
    } finally {
      await client.close();
    }
  });
});

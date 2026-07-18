import { spawn } from "node:child_process";
import type { Server } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startContractServer } from "./helpers/contract-server.js";

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

function cleanEnvironment(extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extra }).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    })
  );
}

describe("Claude Code hook process", () => {
  it("emits a live user-only card and never echoes the raw prompt", async () => {
    const contract = await startContractServer();
    server = contract.server;
    const dataDirectory = await mkdtemp(join(tmpdir(), "grace-hook-test-"));
    const tsxCli = resolve("node_modules", "tsx", "dist", "cli.mjs");
    const hookScript = resolve("src", "hooks", "on-prompt.ts");
    const child = spawn(process.execPath, [tsxCli, hookScript], {
      cwd: process.cwd(),
      env: cleanEnvironment({
        GRACE_DEMO_ALWAYS: "true",
        GRACE_DATA_DIR: dataDirectory,
        GLOO_CLIENT_ID: "contract-client",
        GLOO_CLIENT_SECRET: "contract-secret",
        GLOO_BASE_URL: contract.baseUrl,
        YVP_APP_KEY: "contract-app-key",
        YOUVERSION_BASE_URL: contract.baseUrl
      }),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.stdin.end(JSON.stringify({
      session_id: "hook-integration",
      hook_event_name: "UserPromptSubmit",
      prompt: "Debug CUSTOMER_SECRET_9182 across the entire repository"
    }));
    const exitCode = await new Promise<number>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolveExit(code ?? 1));
    });
    expect(exitCode, stderr).toBe(0);
    const output = JSON.parse(stdout) as Record<string, unknown>;
    expect(output.systemMessage).toContain("Grace in the Gap");
    expect(output.systemMessage).toContain("GLOO + YOUVERSION");
    expect(stdout).not.toContain("CUSTOMER_SECRET_9182");
    expect(output).not.toHaveProperty("additionalContext");
  });
});

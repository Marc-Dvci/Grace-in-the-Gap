import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startContractServer } from "../tests/helpers/contract-server.js";

// Smoke-tests the built dist bundles as real subprocesses. The bundles run in
// live mode against the shared contract double (no billable API calls).

const projectRoot = resolve(import.meta.dirname, "..");
const hookPath = resolve(projectRoot, "dist", "hooks", "on-prompt.js");
const mcpPath = resolve(projectRoot, "dist", "mcp", "server.js");
if (!existsSync(hookPath) || !existsSync(mcpPath)) {
  throw new Error("Production hook or MCP bundle is missing");
}

function environment(baseUrl: string, extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      ...process.env,
      GLOO_CLIENT_ID: "contract-client",
      GLOO_CLIENT_SECRET: "contract-secret",
      GLOO_BASE_URL: baseUrl,
      YVP_APP_KEY: "contract-app-key",
      YOUVERSION_BASE_URL: baseUrl,
      ...extra
    }).filter(([, value]) => typeof value === "string")
  ) as Record<string, string>;
}

async function smokeHook(baseUrl: string, dataDirectory: string): Promise<void> {
  const child = spawn(process.execPath, [hookPath], {
    cwd: projectRoot,
    env: environment(baseUrl, { GRACE_DEMO_ALWAYS: "true", GRACE_DATA_DIR: dataDirectory }),
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(JSON.stringify({
    session_id: "built-smoke",
    hook_event_name: "UserPromptSubmit",
    prompt: "Build a complete feature and tests"
  }));
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Built hook failed: ${stderr}`);
  const output = JSON.parse(stdout) as Record<string, unknown>;
  if (typeof output.systemMessage !== "string" || !output.systemMessage.includes("Grace in the Gap")) {
    throw new Error("Built hook did not emit a Grace systemMessage");
  }
}

async function smokeMcp(baseUrl: string, dataDirectory: string): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath],
    env: environment(baseUrl, { GRACE_DATA_DIR: dataDirectory })
  });
  const client = new Client({ name: "built-smoke", version: "0.2.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    const expected = ["configure_grace", "grace_feedback", "grace_moment", "grace_status"];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected built MCP tools: ${names.join(", ")}`);
    }
    const result = await client.callTool({ name: "grace_moment", arguments: { taskType: "testing" } });
    if (result.isError || !JSON.stringify(result.content).includes("Grace in the Gap")) {
      throw new Error("Built MCP server did not return a Grace moment");
    }
    const feedbackId = JSON.stringify(result.content).match(/Feedback ID: ([0-9a-f]{8})/)?.[1];
    if (!feedbackId) throw new Error("Built MCP card omitted its feedback ID");
    const feedback = await client.callTool({
      name: "grace_feedback",
      arguments: { momentId: feedbackId, rating: 5 }
    });
    if (feedback.isError) throw new Error("Built MCP feedback tool failed");
  } finally {
    await client.close();
  }
}

const contract = await startContractServer();
try {
  const dataDirectory = await mkdtemp(join(tmpdir(), "grace-built-smoke-"));
  await smokeHook(contract.baseUrl, dataDirectory);
  await smokeMcp(contract.baseUrl, dataDirectory);
  process.stdout.write("Built hook: OK\nBuilt MCP stdio server: OK\n");
} finally {
  await new Promise<void>((resolve) => contract.server.close(() => resolve()));
}

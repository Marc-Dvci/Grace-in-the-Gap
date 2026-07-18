import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApiServer, listen } from "../src/api/server.js";
import { buildManualEvent } from "../src/privacy/normalize.js";
import { createService } from "../src/service/factory.js";
import { contractConfig, startContractServer } from "./helpers/contract-server.js";

let apiServer: Server | undefined;
let contractServer: Server | undefined;
afterEach(async () => {
  if (apiServer) await new Promise<void>((resolve) => apiServer?.close(() => resolve()));
  if (contractServer) await new Promise<void>((resolve) => contractServer?.close(() => resolve()));
  apiServer = undefined;
  contractServer = undefined;
});

describe("local Grace API", () => {
  it("serves health and a complete live moment", async () => {
    const contract = await startContractServer();
    contractServer = contract.server;
    apiServer = createApiServer(createService(contractConfig(contract.baseUrl)));
    const address = await listen(apiServer, 0);
    const baseUrl = `http://${address.host}:${address.port}`;

    const health = await fetch(`${baseUrl}/health`).then((response) => response.json()) as Record<string, unknown>;
    expect(health.status).toBe("ok");
    expect(health.provider).toBe("gloo + youversion (live)");

    const response = await fetch(`${baseUrl}/v1/moments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildManualEvent({ taskType: "review", locale: "en-US", sessionSeed: "api" }))
    });
    expect(response.status).toBe(200);
    const moment = await response.json() as Record<string, unknown>;
    expect((moment.provenance as Record<string, unknown>).live).toBe(true);
  });

  it("rejects raw prompt fields at the API boundary", async () => {
    const contract = await startContractServer();
    contractServer = contract.server;
    apiServer = createApiServer(createService(contractConfig(contract.baseUrl)));
    const address = await listen(apiServer, 0);
    const event = buildManualEvent({ locale: "en-US", sessionSeed: "api-private" });
    const response = await fetch(`http://${address.host}:${address.port}/v1/moments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, prompt: "must not cross boundary" })
    });
    expect(response.status).toBe(400);
  });
});

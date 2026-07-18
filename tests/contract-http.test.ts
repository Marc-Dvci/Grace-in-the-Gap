import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createService } from "../src/service/factory.js";
import { buildManualEvent } from "../src/privacy/normalize.js";
import { contractConfig, startContractServer } from "./helpers/contract-server.js";

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe("live provider adapters against contract doubles", () => {
  it("exercises Gloo OAuth/Responses and the YouVersion passage + metadata paths", async () => {
    const contract = await startContractServer();
    server = contract.server;
    const { service } = createService(contractConfig(contract.baseUrl));
    const moment = await service.create(buildManualEvent({
      taskType: "debugging", locale: "en-US", sessionSeed: "SECRET_RAW_PROMPT_MUST_NOT_LEAK",
      now: new Date("2026-07-18T14:00:00")
    }));

    const paths = contract.requests.map((request) => request.path);
    expect(paths).toContain("/oauth2/token");
    expect(paths).toContain("/ai/v1/responses");
    expect(paths).toContain(`/v1/bibles/3034/passages/${moment.passage.usfm}`);
    expect(paths).toContain("/v1/bibles/3034");

    expect(JSON.stringify(contract.requests)).not.toContain("SECRET_RAW_PROMPT_MUST_NOT_LEAK");
    expect(moment.provenance.live).toBe(true);
    expect(moment.provenance.degraded).toBe(false);
    expect(moment.passage.versionId).toBe("3034");
    expect(moment.passage.copyright).toContain("Public Domain");
    // The copyright must be unwrapped from the publisher's literal quotes.
    expect(moment.passage.copyright.startsWith('"')).toBe(false);
  });

  it("fails closed to on-device selection on malformed Gloo output", async () => {
    const contract = await startContractServer({ invalidGlooJson: true });
    server = contract.server;
    const { service } = createService(contractConfig(contract.baseUrl));
    const moment = await service.create(buildManualEvent({
      taskType: "testing", locale: "en-US", sessionSeed: "malformed",
      now: new Date("2026-07-18T14:00:00")
    }));
    expect(moment.provenance.selector).toBe("local-rule-fallback");
    expect(moment.provenance.degraded).toBe(true);
    // Scripture is still fetched live even when the selector degrades.
    expect(moment.provenance.live).toBe(true);
  });

  it("falls back to bundled public-domain Scripture when YouVersion is unavailable", async () => {
    const contract = await startContractServer({ failYouVersion: true });
    server = contract.server;
    const { service } = createService(contractConfig(contract.baseUrl));
    const moment = await service.create(buildManualEvent({
      taskType: "review", locale: "en-US", sessionSeed: "yv-down",
      now: new Date("2026-07-18T14:00:00")
    }));
    expect(moment.provenance.live).toBe(false);
    expect(moment.provenance.degraded).toBe(true);
    expect(moment.passage.copyright).toContain("Public Domain");
    expect(moment.passage.text.length).toBeGreaterThan(0);
  });
});

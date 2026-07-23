import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCredentials,
  credentialStatus,
  loadConfig,
  MISSING_CREDENTIALS_MESSAGE
} from "../src/config.js";
import { TelemetryWriter } from "../src/telemetry.js";

describe("configuration and allow-listed telemetry", () => {
  it("parses explicit provider and contextual preferences without exposing credentials", () => {
    const config = loadConfig({
      GLOO_CLIENT_ID: "client",
      GLOO_CLIENT_SECRET: "secret",
      YVP_APP_KEY: "app",
      GLOO_ENDPOINT_MODE: "grounded",
      GLOO_RAG_PUBLISHER: "GraceInTheGap",
      GRACE_LOCALE: "fr-FR",
      GRACE_TIME_ZONE: "Europe/Paris",
      GRACE_TRADITION: "catholic",
      GRACE_PREFERRED_TONE: "reflective",
      GRACE_HISTORY_LIMIT: "15",
      GRACE_CONTEXT_MODE: "private",
      GRACE_TELEMETRY_ENABLED: "true"
    });
    expect(config.preferences).toMatchObject({
      locale: "fr-FR",
      timeZone: "Europe/Paris",
      tradition: "catholic",
      preferredTone: "reflective",
      historyLimit: 15,
      contextMode: "private",
      telemetryEnabled: true
    });
    expect(config.gloo.endpointMode).toBe("grounded");
    expect(credentialStatus(config)).toEqual({ gloo: true, youVersion: true, complete: true });
    expect(() => assertCredentials(config)).not.toThrow();

    const missing = loadConfig({});
    expect(() => assertCredentials(missing)).toThrow(MISSING_CREDENTIALS_MESSAGE);
    expect(JSON.stringify(credentialStatus(config))).not.toContain("secret");
  });

  it("writes only schema-approved local events and remains inert when disabled", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grace-telemetry-"));
    const enabledPath = join(directory, "enabled.jsonl");
    await new TelemetryWriter(true, enabledPath).write({
      event: "feedback",
      at: "2026-07-23T12:00:00.000Z",
      traceId: "00d2c3b1-bc3d-42c5-b63d-116707f7f111",
      rating: 5
    });
    const stored = await readFile(enabledPath, "utf8");
    expect(JSON.parse(stored)).toEqual({
      event: "feedback",
      at: "2026-07-23T12:00:00.000Z",
      traceId: "00d2c3b1-bc3d-42c5-b63d-116707f7f111",
      rating: 5
    });

    const disabledPath = join(directory, "disabled.jsonl");
    await new TelemetryWriter(false, disabledPath).write({
      event: "card_rendered",
      at: "2026-07-23T12:00:00.000Z"
    });
    await expect(stat(disabledPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

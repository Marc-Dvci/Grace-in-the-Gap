import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { credentialStatus, loadConfig, MISSING_CREDENTIALS_MESSAGE } from "../config.js";
import { GraceDataStore } from "../data/store.js";
import { PreferencesSchema, TaskTypeSchema } from "../domain.js";
import { buildManualEvent } from "../privacy/normalize.js";
import { renderTerminalCard } from "../render.js";
import { createService } from "../service/factory.js";
import { TelemetryWriter } from "../telemetry.js";

const server = new McpServer(
  { name: "grace-in-the-gap", version: "0.2.0" },
  {
    instructions:
      "Grace provides brief pre-authored Scripture moments. Never send source code, file contents, or raw prompts to its tools."
  }
);

server.registerTool(
  "grace_moment",
  {
    title: "Show a Grace moment",
    description: "Returns one brief pre-authored reflection and a live YouVersion Scripture passage without accepting prompt or code content.",
    inputSchema: z.object({
      taskType: TaskTypeSchema.optional().describe("Optional coarse task label only"),
      locale: z.string().min(2).max(35).optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false }
  },
  async ({ taskType, locale }) => {
    const config = loadConfig();
    if (!credentialStatus(config).complete) {
      return { isError: true, content: [{ type: "text" as const, text: MISSING_CREDENTIALS_MESSAGE }] };
    }
    const store = new GraceDataStore(config.dataDirectory);
    const preferences = await store.loadPreferences(config.preferences);
    const feedback = await store.loadFeedbackContext();
    const { service } = createService({ ...config, preferences });
    const event = buildManualEvent({
      ...(taskType ? { taskType } : {}),
      locale: locale ?? preferences.locale,
      timeZone: preferences.timeZone,
      tradition: preferences.tradition,
      preferredTone: preferences.preferredTone,
      preferredProfileIds: feedback.preferredProfileIds,
      avoidedProfileIds: feedback.avoidedProfileIds,
      avoidedPassageIds: feedback.avoidedPassageIds,
      sessionSeed: `mcp:${new Date().toISOString().slice(0, 13)}`,
      surface: "mcp"
    });
    const moment = await service.create(event);
    await store.recordPresentedMoment(moment);
    return {
      content: [{ type: "text" as const, text: renderTerminalCard(moment) }]
    };
  }
);

server.registerTool(
  "grace_feedback",
  {
    title: "Rate a Grace moment",
    description:
      "Stores a 1-5 rating locally and uses it to personalize future approved profile and passage choices.",
    inputSchema: z.object({
      momentId: z.string().min(8).max(36).describe("The short Feedback ID printed on the card"),
      rating: z.number().int().min(1).max(5)
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  },
  async ({ momentId, rating }) => {
    const config = loadConfig();
    const store = new GraceDataStore(config.dataDirectory);
    const preferences = await store.loadPreferences(config.preferences);
    const recorded = await store.recordFeedback(momentId, rating);
    const telemetry = new TelemetryWriter(preferences.telemetryEnabled, store.telemetryPath);
    await telemetry.write({
      event: "feedback",
      at: new Date().toISOString(),
      traceId: recorded.traceId,
      rating: recorded.rating
    });
    return {
      content: [{
        type: "text" as const,
        text: "Feedback saved locally. Future selections will reflect it."
      }]
    };
  }
);

server.registerTool(
  "grace_status",
  {
    title: "Grace privacy and provider status",
    description: "Reports non-secret Grace configuration and privacy guarantees.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async () => {
    const config = loadConfig();
    const store = new GraceDataStore(config.dataDirectory);
    const preferences = await store.loadPreferences(config.preferences);
    const credentials = credentialStatus(config);
    const status = {
      enabled: preferences.enabled,
      provider: "gloo + youversion (live)",
      credentials: {
        gloo: credentials.gloo ? "configured" : "missing",
        youVersion: credentials.youVersion ? "configured" : "missing"
      },
      contextMode: preferences.contextMode,
      telemetryEnabled: preferences.telemetryEnabled,
      rawPromptStored: false,
      rawPromptTransmitted: false,
      cooldownMinutes: preferences.cooldownMinutes,
      maxCardsPerDay: preferences.maxCardsPerDay,
      locale: preferences.locale,
      timeZone: preferences.timeZone,
      tradition: preferences.tradition,
      preferredTone: preferences.preferredTone,
      dataDirectory: store.directory
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
  }
);

server.registerTool(
  "configure_grace",
  {
    title: "Configure Grace",
    description: "Updates only explicit local Grace preferences. Telemetry remains off unless explicitly set true.",
    inputSchema: PreferencesSchema.partial(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  },
  async (changes) => {
    const config = loadConfig();
    const store = new GraceDataStore(config.dataDirectory);
    const current = await store.loadPreferences(config.preferences);
    const updated = PreferencesSchema.parse({ ...current, ...changes });
    await store.savePreferences(updated);
    return {
      content: [{
        type: "text" as const,
        text: `Grace preferences saved locally.\n${JSON.stringify(updated, null, 2)}`
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

#!/usr/bin/env node
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { assertCredentials, credentialStatus, loadConfig } from "./config.js";
import { GraceDataStore } from "./data/store.js";
import { TaskTypeSchema } from "./domain.js";
import {
  buildMomentSpinnerPatch,
  buildSpinnerPatch,
  installSpinnerSettings
} from "./installer/spinner-settings.js";
import { buildManualEvent } from "./privacy/normalize.js";
import { providerLabel, renderTerminalCard } from "./render.js";
import { createService } from "./service/factory.js";
import { TelemetryWriter } from "./telemetry.js";

// Load a local .env file for convenience when running the CLI directly, so
// judges can drop credentials into .env and run without exporting shell vars.
// The Claude Code plugin runtime supplies credentials through secure storage
// and does not depend on this.
try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(
    resolve(process.cwd(), ".env")
  );
} catch {
  // No .env file present, or unsupported Node version — env vars still work.
}

function usage(): void {
  process.stdout.write([
    "Grace in the Gap",
    "",
    "Requires live Gloo and YouVersion credentials (see README.md > Setup).",
    "",
    "Commands:",
    "  moment [task-type]       Show one live moment (Gloo selection + YouVersion Scripture)",
    "  feedback <id> <1-5>      Rate a shown moment locally to personalize future choices",
    "  status                   Show non-secret provider, credential, and privacy status",
    "  spinner preview          Print the official Claude Code settings patch",
    "  spinner install --apply  Install static local tips with a settings backup",
    "  spinner sync --apply     Select one tip through the live providers, then install it",
    "  help                     Show this help",
    ""
  ].join("\n"));
}

async function runMoment(args: string[]): Promise<void> {
  const parsedTask = args[1] ? TaskTypeSchema.safeParse(args[1]) : undefined;
  if (parsedTask && !parsedTask.success) throw new Error(`Unknown task type: ${args[1]}`);
  const config = loadConfig();
  assertCredentials(config);
  const store = new GraceDataStore(config.dataDirectory);
  const preferences = await store.loadPreferences(config.preferences);
  const feedback = await store.loadFeedbackContext();
  const { service } = createService({ ...config, preferences });
  const event = buildManualEvent({
    ...(parsedTask?.success ? { taskType: parsedTask.data } : {}),
    locale: preferences.locale,
    timeZone: preferences.timeZone,
    tradition: preferences.tradition,
    preferredTone: preferences.preferredTone,
    preferredProfileIds: feedback.preferredProfileIds,
    avoidedProfileIds: feedback.avoidedProfileIds,
    avoidedPassageIds: feedback.avoidedPassageIds,
    sessionSeed: "cli-manual-moment",
    surface: "mcp"
  });
  const moment = await service.create(event);
  await store.recordPresentedMoment(moment);
  process.stdout.write(renderTerminalCard(moment));
}

async function runFeedback(args: string[]): Promise<void> {
  const momentId = args[1];
  const rating = Number.parseInt(args[2] ?? "", 10);
  if (!momentId || !Number.isInteger(rating)) {
    throw new Error("Usage: feedback <moment-id> <rating 1-5>");
  }
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
  process.stdout.write("Feedback saved locally. Future selections will reflect it.\n");
}

async function runStatus(): Promise<void> {
  const config = loadConfig();
  const store = new GraceDataStore(config.dataDirectory);
  const preferences = await store.loadPreferences(config.preferences);
  const credentials = credentialStatus(config);
  process.stdout.write(`${JSON.stringify({
    provider: "gloo + youversion (live)",
    credentials: {
      gloo: credentials.gloo ? "configured" : "missing",
      youVersion: credentials.youVersion ? "configured" : "missing"
    },
    glooEndpointMode: config.gloo.endpointMode,
    enabled: preferences.enabled,
    locale: preferences.locale,
    timeZone: preferences.timeZone,
    tradition: preferences.tradition,
    preferredTone: preferences.preferredTone,
    contextMode: preferences.contextMode,
    telemetryEnabled: preferences.telemetryEnabled,
    rawPromptStored: false,
    rawPromptTransmitted: false,
    dataDirectory: resolve(store.directory)
  }, null, 2)}\n`);
}

async function runSpinner(args: string[]): Promise<void> {
  const action = args[1] ?? "preview";
  const settingsIndex = args.indexOf("--settings");
  const settingsPath = settingsIndex >= 0 && args[settingsIndex + 1]
    ? resolve(args[settingsIndex + 1] as string)
    : join(homedir(), ".claude", "settings.json");

  if (action === "preview") {
    process.stdout.write(`${JSON.stringify(buildSpinnerPatch(), null, 2)}\n`);
    return;
  }
  if (action === "install") {
    if (!args.includes("--apply")) {
      process.stdout.write("Dry run only. Add --apply to update Claude Code settings.\n");
      process.stdout.write(`${JSON.stringify(buildSpinnerPatch(), null, 2)}\n`);
      return;
    }
    const result = await installSpinnerSettings(settingsPath);
    process.stdout.write(`Installed Grace spinner tips in ${settingsPath}.\n`);
    if (result.backupPath) process.stdout.write(`Backup: ${result.backupPath}\n`);
    process.stdout.write("Restart Claude Code to load the settings.\n");
    return;
  }
  if (action === "sync") {
    const config = loadConfig();
    assertCredentials(config);
    const store = new GraceDataStore(config.dataDirectory);
    const preferences = await store.loadPreferences(config.preferences);
    const feedback = await store.loadFeedbackContext();
    const { service } = createService({ ...config, preferences });
    const event = buildManualEvent({
      taskType: "unknown",
      locale: preferences.locale,
      timeZone: preferences.timeZone,
      tradition: preferences.tradition,
      preferredTone: preferences.preferredTone,
      preferredProfileIds: feedback.preferredProfileIds,
      avoidedProfileIds: feedback.avoidedProfileIds,
      avoidedPassageIds: feedback.avoidedPassageIds,
      sessionSeed: `spinner-sync:${new Date().toISOString().slice(0, 10)}`,
      surface: "demo"
    });
    const moment = await service.create(event);
    const dynamicPatch = buildMomentSpinnerPatch(moment);
    if (!args.includes("--apply")) {
      process.stdout.write("Dry run only. Add --apply to update Claude Code settings.\n");
      process.stdout.write(`${JSON.stringify(dynamicPatch, null, 2)}\n`);
      return;
    }
    const result = await installSpinnerSettings(settingsPath, dynamicPatch);
    const source = providerLabel(moment);
    process.stdout.write(`Synced one Grace spinner tip (${source}).\n`);
    process.stdout.write(`Settings: ${settingsPath}\n`);
    if (result.backupPath) process.stdout.write(`Backup: ${result.backupPath}\n`);
    process.stdout.write("Restart Claude Code to load the selected tip.\n");
    return;
  }
  throw new Error(`Unknown spinner action: ${action}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  switch (command) {
    case "moment":
      await runMoment(args);
      return;
    case "status":
      await runStatus();
      return;
    case "feedback":
      await runFeedback(args);
      return;
    case "spinner":
      await runSpinner(args);
      return;
    default:
      usage();
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

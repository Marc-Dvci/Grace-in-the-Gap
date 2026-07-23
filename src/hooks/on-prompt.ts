import { loadConfig } from "../config.js";
import { GraceDataStore } from "../data/store.js";
import { evaluatePolicy, recordShown } from "../policy.js";
import {
  ClaudeHookInputSchema,
  hashSessionId,
  normalizeClaudeHook
} from "../privacy/normalize.js";
import { renderHookCard } from "../render.js";
import { createService } from "../service/factory.js";
import { TelemetryWriter, type TelemetryEvent } from "../telemetry.js";

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function emit(value: object): void {
  process.stdout.write(JSON.stringify(value));
}

async function writeTelemetrySafely(
  writer: TelemetryWriter,
  event: TelemetryEvent
): Promise<void> {
  try {
    await writer.write(event);
  } catch {
    // Telemetry is never allowed to block or suppress a Grace experience.
  }
}

async function main(): Promise<void> {
  try {
    const input = JSON.parse(await readStandardInput()) as unknown;
    const hook = ClaudeHookInputSchema.parse(input);
    const baseConfig = loadConfig();
    const store = new GraceDataStore(baseConfig.dataDirectory);
    const preferences = await store.loadPreferences(baseConfig.preferences);
    const config = { ...baseConfig, preferences };
    const now = new Date();
    const salt = await store.installationSalt();
    const sessionHash = hashSessionId(hook.session_id, salt);
    const [sessionState, feedback] = await Promise.all([
      store.loadSessionState(sessionHash, now),
      store.loadFeedbackContext()
    ]);
    const telemetry = new TelemetryWriter(preferences.telemetryEnabled, store.telemetryPath);
    const event = normalizeClaudeHook(input, {
      locale: preferences.locale,
      timeZone: preferences.timeZone,
      tradition: preferences.tradition,
      preferredTone: preferences.preferredTone,
      contextMode: preferences.contextMode,
      sessionState,
      feedback,
      sessionSalt: salt,
      now
    });
    const state = await store.loadPolicyState(now, preferences.timeZone);
    const policy = evaluatePolicy(event, preferences, state, now);
    if (!policy.show) {
      await Promise.all([
        ...(event.estimatedWaitSeconds > 0
          ? [store.recordSessionTurn({
              previous: sessionState,
              taskType: event.taskType,
              now
            })]
          : []),
        writeTelemetrySafely(telemetry, {
          event: "card_skipped",
          at: now.toISOString(),
          taskType: event.taskType,
          reason: policy.reason
        })
      ]);
      emit({ suppressOutput: true });
      return;
    }

    const { service } = createService(config);
    const moment = await service.create(event);
    await Promise.all([
      store.savePolicyState(recordShown(state, now)),
      store.recordSessionMoment({
        previous: sessionState,
        taskType: event.taskType,
        moment,
        historyLimit: preferences.historyLimit,
        now
      }),
      store.recordPresentedMoment(moment),
      writeTelemetrySafely(telemetry, {
        event: "card_rendered",
        at: now.toISOString(),
        traceId: moment.traceId,
        taskType: event.taskType,
        live: moment.provenance.live,
        degraded: moment.provenance.degraded
      }),
      ...(moment.provenance.degraded
        ? [writeTelemetrySafely(telemetry, {
            event: "provider_fallback" as const,
            at: now.toISOString(),
            traceId: moment.traceId,
            taskType: event.taskType,
            live: moment.provenance.live,
            degraded: true
          })]
        : [])
    ]);
    emit({ systemMessage: renderHookCard(moment), suppressOutput: true });
  } catch {
    emit({ suppressOutput: true });
  }
}

await main();

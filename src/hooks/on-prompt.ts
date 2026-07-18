import { loadConfig } from "../config.js";
import { GraceDataStore } from "../data/store.js";
import { evaluatePolicy, recordShown } from "../policy.js";
import { normalizeClaudeHook } from "../privacy/normalize.js";
import { renderHookCard } from "../render.js";
import { createService } from "../service/factory.js";

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function emit(value: object): void {
  process.stdout.write(JSON.stringify(value));
}

async function main(): Promise<void> {
  try {
    const input = JSON.parse(await readStandardInput()) as unknown;
    const baseConfig = loadConfig();
    const store = new GraceDataStore(baseConfig.dataDirectory);
    const preferences = await store.loadPreferences(baseConfig.preferences);
    const config = { ...baseConfig, preferences };
    const now = new Date();
    const event = normalizeClaudeHook(input, {
      locale: preferences.locale,
      contextMode: preferences.contextMode,
      now
    });
    const state = await store.loadPolicyState(now);
    const policy = evaluatePolicy(event, preferences, state, now);
    if (!policy.show) {
      emit({ suppressOutput: true });
      return;
    }

    const { service } = createService(config);
    const moment = await service.create(event);
    await store.savePolicyState(recordShown(state, now));
    emit({ systemMessage: renderHookCard(moment), suppressOutput: true });
  } catch {
    emit({ suppressOutput: true });
  }
}

await main();

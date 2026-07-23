import { resolve } from "node:path";
import { assertCredentials, loadConfig } from "../src/config.js";
import { ContentRepository } from "../src/content/repository.js";
import { GlooSelector } from "../src/providers/gloo.js";
import { YouVersionProvider } from "../src/providers/youversion.js";
import { buildManualEvent } from "../src/privacy/normalize.js";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(
    resolve(process.cwd(), ".env")
  );
} catch {
  // Environment variables remain the supported non-file configuration path.
}

const config = loadConfig();
assertCredentials(config);
const content = new ContentRepository();
const event = buildManualEvent({
  taskType: "debugging",
  locale: config.preferences.locale,
  timeZone: config.preferences.timeZone,
  tradition: config.preferences.tradition,
  preferredTone: config.preferences.preferredTone,
  sessionSeed: "live-canary",
  surface: "demo"
});
const candidates = content.candidatesFor(event).map((profile) => ({
  ...profile,
  passage_hints: content.passageCandidatesFor(profile, event),
  snippet_ids: content.snippetCandidatesFor(profile, event)
}));

try {
  const selector = new GlooSelector(config.gloo);
  const selection = await selector.select(event, candidates);
  const scripture = new YouVersionProvider(config.youVersion);
  const passage = await scripture.getPassage(
    config.preferences.bibleVersionId,
    selection.decision.passageHint,
    event.locale
  );
  process.stdout.write(`${JSON.stringify({
    ok: true,
    selector: selection.metadata.provider,
    selectedProfile: selection.decision.momentProfileId,
    selectedPassage: selection.decision.passageHint,
    reasonCodes: selection.decision.reasonCodes,
    scripture: passage.metadata.provider,
    versionId: passage.passage.versionId,
    versionName: passage.passage.versionName,
    locale: passage.passage.locale,
    copyrightPresent: passage.passage.copyright.length > 0,
    rawPromptTransmitted: false
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Live canary failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

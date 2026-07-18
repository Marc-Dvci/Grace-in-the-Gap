import { ContentRepository } from "../content/repository.js";
import { WaitEventSchema, type TaskType, type WaitEvent } from "../domain.js";
import { selectLocally } from "../selection/local-selector.js";

/**
 * Offline validation of the deterministic on-device selector across every
 * supported wait context. This exercises the selection + catalog-resolution
 * logic that also backs the live path's degradation fallback; it makes no API
 * calls. Each scenario must resolve to a catalog-valid profile, an approved
 * reflection snippet, and a known passage reference, with wide passage
 * diversity so moments do not feel repetitive.
 */
const taskTypes: TaskType[] = [
  "generation", "implementation", "debugging", "testing", "analysis", "refactor", "planning", "review", "unknown"
];
const timeWindows: WaitEvent["timeWindow"][] = ["morning", "afternoon", "evening", "late-evening"];
const waits = [8, 12, 20];

const content = new ContentRepository();

let count = 0;
let failures = 0;
const distribution: Record<string, number> = {};
for (const taskType of taskTypes) {
  for (const timeWindow of timeWindows) {
    for (const estimatedWaitSeconds of waits) {
      count += 1;
      try {
        const event = WaitEventSchema.parse({
          surface: "demo",
          taskType,
          estimatedWaitSeconds,
          durationBucket: estimatedWaitSeconds <= 15 ? "8-15" : "16-30",
          locale: "en-US",
          timeWindow,
          sessionHash: `eval-session-${String(count).padStart(4, "0")}`,
          contextMode: "private"
        });
        const decision = selectLocally(event, content.candidatesFor(event));
        // Every choice must resolve to real, approved catalog content.
        const snippet = content.getSnippet(decision.reflectionSnippetId, "en-US");
        if (snippet.status !== "approved-for-demo") failures += 1;
        const reference = content.referenceFor(decision.passageHint);
        if (!reference || reference === decision.passageHint) failures += 1;
        distribution[decision.passageHint] = (distribution[decision.passageHint] ?? 0) + 1;
      } catch {
        failures += 1;
      }
    }
  }
}

const result = {
  scenarios: count,
  passed: count - failures,
  failures,
  schemaComplianceRate: (count - failures) / count,
  uniquePassages: Object.keys(distribution).length,
  distribution
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures > 0 || Object.keys(distribution).length < 6) process.exitCode = 1;

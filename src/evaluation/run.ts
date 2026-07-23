import { ContentRepository } from "../content/repository.js";
import {
  SelectorDecisionSchema,
  WaitEventSchema,
  type TaskType,
  type WaitEvent
} from "../domain.js";
import { buildManualEvent } from "../privacy/normalize.js";
import { selectLocally } from "../selection/local-selector.js";

/**
 * Deterministic, offline contest evaluation.
 *
 * This deliberately measures more than parse success:
 * - broad schema/catalog integrity across the context matrix;
 * - editorial "golden" relevance cases for workflow, calendar, time, and tone;
 * - immediate repetition over a simulated session with local history.
 *
 * It is not presented as a substitute for human theological/editorial review.
 */

const content = new ContentRepository();
const taskTypes: TaskType[] = [
  "generation", "implementation", "debugging", "testing", "analysis",
  "refactor", "planning", "review", "unknown"
];
const timeWindows: WaitEvent["timeWindow"][] = [
  "morning", "afternoon", "evening", "late-evening"
];
const waits = [8, 12, 20];

function dateForWindow(window: WaitEvent["timeWindow"]): Date {
  const hour = {
    morning: "08",
    afternoon: "14",
    evening: "19",
    "late-evening": "23"
  }[window];
  return new Date(`2026-07-18T${hour}:00:00Z`);
}

function validateDecision(event: WaitEvent) {
  const candidates = content.candidatesFor(event);
  const decision = SelectorDecisionSchema.parse(selectLocally(event, candidates));
  const profile = candidates.find((item) => item.id === decision.momentProfileId);
  if (!profile) throw new Error("selector returned an ineligible profile");
  if (!profile.snippet_ids.includes(decision.reflectionSnippetId)) {
    throw new Error("selector returned a snippet outside its profile");
  }
  if (!profile.passage_hints.includes(decision.passageHint)) {
    throw new Error("selector returned a passage outside its profile");
  }
  if (content.getSnippet(decision.reflectionSnippetId, event.locale).status !== "approved-for-demo") {
    throw new Error("selector returned an unapproved reflection");
  }
  if (content.referenceFor(decision.passageHint) === decision.passageHint) {
    throw new Error("selector returned an unresolved passage reference");
  }
  return decision;
}

let matrixFailures = 0;
let matrixScenarios = 0;
const distribution: Record<string, number> = {};
for (const taskType of taskTypes) {
  for (const timeWindow of timeWindows) {
    for (const estimatedWaitSeconds of waits) {
      matrixScenarios += 1;
      try {
        const base = buildManualEvent({
          taskType,
          locale: "en-US",
          sessionSeed: `matrix-${matrixScenarios}`,
          timeZone: "UTC",
          now: dateForWindow(timeWindow),
          surface: "demo"
        });
        const event = WaitEventSchema.parse({
          ...base,
          estimatedWaitSeconds,
          durationBucket: estimatedWaitSeconds <= 15 ? "8-15" : "16-30"
        });
        const decision = validateDecision(event);
        distribution[decision.passageHint] = (distribution[decision.passageHint] ?? 0) + 1;
      } catch {
        matrixFailures += 1;
      }
    }
  }
}

interface GoldenScenario {
  id: string;
  event: WaitEvent;
  expectedProfile: string;
  expectedPassage?: string;
}

const goldenScenarios: GoldenScenario[] = [
  {
    id: "stuck-debugging",
    event: buildManualEvent({
      taskType: "debugging", locale: "en-US", sessionSeed: "golden-retry",
      workflowStage: "stuck", lastOutcome: "failure", repeatBucket: "three-plus",
      now: new Date("2026-07-18T14:00:00Z"), surface: "demo"
    }),
    expectedProfile: "perseverance-in-retrying"
  },
  {
    id: "completed-implementation",
    event: buildManualEvent({
      taskType: "implementation", locale: "en-US", sessionSeed: "golden-complete",
      workflowStage: "completed", lastOutcome: "success",
      now: new Date("2026-07-18T14:00:00Z"), surface: "demo"
    }),
    expectedProfile: "gratitude-after-progress"
  },
  {
    id: "mary-magdalene",
    event: buildManualEvent({
      taskType: "debugging", locale: "en-US", sessionSeed: "golden-july-22",
      timeZone: "Europe/Paris", now: new Date("2026-07-22T10:00:00Z"), surface: "demo"
    }),
    expectedProfile: "today-in-the-church-year",
    expectedPassage: "JHN.20.16-18"
  },
  {
    id: "ash-wednesday",
    event: buildManualEvent({
      taskType: "analysis", locale: "en-US", sessionSeed: "golden-ash",
      now: new Date("2026-02-18T12:00:00Z"), surface: "demo"
    }),
    expectedProfile: "today-in-the-church-year",
    expectedPassage: "MAT.6.3-6"
  },
  {
    id: "easter-day",
    event: buildManualEvent({
      taskType: "planning", locale: "en-US", sessionSeed: "golden-easter",
      now: new Date("2026-04-05T12:00:00Z"), surface: "demo"
    }),
    expectedProfile: "today-in-the-church-year",
    expectedPassage: "JHN.20.16-18"
  },
  {
    id: "advent-season",
    event: buildManualEvent({
      taskType: "planning", locale: "en-US", sessionSeed: "golden-advent",
      now: new Date("2026-12-10T14:00:00Z"), surface: "demo"
    }),
    expectedProfile: "season-of-advent"
  },
  {
    id: "late-work",
    event: buildManualEvent({
      taskType: "testing", locale: "en-US", sessionSeed: "golden-late",
      now: new Date("2026-07-18T23:00:00Z"), surface: "demo"
    }),
    expectedProfile: "rest-for-late-work"
  },
  {
    id: "calm-preference",
    event: buildManualEvent({
      taskType: "analysis", locale: "en-US", sessionSeed: "golden-tone",
      preferredTone: "calm", now: new Date("2026-07-18T14:00:00Z"), surface: "demo"
    }),
    expectedProfile: "quiet-trust"
  }
];

const goldenResults = goldenScenarios.map((scenario) => {
  try {
    const decision = validateDecision(scenario.event);
    const accepted =
      decision.momentProfileId === scenario.expectedProfile &&
      (!scenario.expectedPassage || decision.passageHint === scenario.expectedPassage);
    return {
      id: scenario.id,
      accepted,
      selectedProfile: decision.momentProfileId,
      selectedPassage: decision.passageHint
    };
  } catch {
    return { id: scenario.id, accepted: false };
  }
});

let recentPassageIds: string[] = [];
let recentSnippetIds: string[] = [];
let recentProfileIds: string[] = [];
let previous: ReturnType<typeof validateDecision> | undefined;
let immediateRepeats = 0;
const sequencePassages = new Set<string>();
for (let turn = 0; turn < 24; turn += 1) {
  const event = buildManualEvent({
    taskType: "analysis",
    locale: "fr-FR",
    sessionSeed: "sequence-session",
    recentPassageIds,
    recentSnippetIds,
    recentProfileIds,
    now: new Date("2026-07-18T14:00:00Z"),
    surface: "demo"
  });
  const decision = validateDecision(event);
  if (
    previous &&
    (previous.passageHint === decision.passageHint ||
      previous.reflectionSnippetId === decision.reflectionSnippetId)
  ) {
    immediateRepeats += 1;
  }
  sequencePassages.add(decision.passageHint);
  recentPassageIds = [decision.passageHint, ...recentPassageIds.filter((id) => id !== decision.passageHint)]
    .slice(0, 12);
  recentSnippetIds = [
    decision.reflectionSnippetId,
    ...recentSnippetIds.filter((id) => id !== decision.reflectionSnippetId)
  ].slice(0, 12);
  recentProfileIds = [
    decision.momentProfileId,
    ...recentProfileIds.filter((id) => id !== decision.momentProfileId)
  ].slice(0, 12);
  previous = decision;
}

const goldenAccepted = goldenResults.filter((item) => item.accepted).length;
const repeatRate = immediateRepeats / 23;
const result = {
  contextMatrix: {
    scenarios: matrixScenarios,
    passed: matrixScenarios - matrixFailures,
    failures: matrixFailures,
    schemaComplianceRate: (matrixScenarios - matrixFailures) / matrixScenarios,
    uniquePassages: Object.keys(distribution).length,
    distribution
  },
  editorialGoldenRelevance: {
    scenarios: goldenResults.length,
    accepted: goldenAccepted,
    acceptanceRate: goldenAccepted / goldenResults.length,
    results: goldenResults
  },
  repetitionSimulation: {
    turns: 24,
    immediateRepeats,
    immediateRepeatRate: repeatRate,
    uniquePassages: sequencePassages.size
  }
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (
  matrixFailures > 0 ||
  Object.keys(distribution).length < 12 ||
  goldenAccepted !== goldenResults.length ||
  repeatRate > 0
) {
  process.exitCode = 1;
}

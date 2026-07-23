import {
  SelectorDecisionSchema,
  type Profile,
  type SelectorDecision,
  type WaitEvent
} from "../domain.js";
import { ContentRepository } from "../content/repository.js";

const content = new ContentRepository();

function stableNumber(seed: string): number {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function leastRecentlyUsed(candidates: readonly string[], recent: readonly string[]): string[] {
  if (candidates.length === 0) return [];
  const ranked = candidates.map((candidate) => ({
    candidate,
    // Histories are newest-first. A larger index means the item was seen less
    // recently; -1 means it has never been seen and should win immediately.
    age: recent.indexOf(candidate)
  }));
  const unseen = ranked.filter((item) => item.age === -1).map((item) => item.candidate);
  if (unseen.length > 0) return unseen;
  const oldestIndex = Math.max(...ranked.map((item) => item.age));
  return ranked.filter((item) => item.age === oldestIndex).map((item) => item.candidate);
}

export function selectLocally(event: WaitEvent, candidates: readonly Profile[]): SelectorDecision {
  if (candidates.length === 0) throw new Error("No eligible moment profiles");
  const ranked = candidates
    .map((profile) => {
      const seed = `${event.sessionHash}:${event.calendar.localDate}:${event.recentProfileIds.length}:${profile.id}`;
      const jitter = (stableNumber(seed) % 1000) / 4000;
      return { profile, score: content.scoreProfile(event, profile) + jitter };
    })
    .sort((left, right) => right.score - left.score || left.profile.id.localeCompare(right.profile.id));
  const selected = ranked[0]?.profile;
  if (!selected) throw new Error("Unable to choose a moment profile");

  const allPassageCandidates = content.passageCandidatesFor(selected, event);
  const unmutedPassages = allPassageCandidates.filter((id) => !event.avoidedPassageIds.includes(id));
  const passageCandidates = unmutedPassages.length > 0 ? unmutedPassages : allPassageCandidates;
  const passagePool = leastRecentlyUsed(passageCandidates, event.recentPassageIds);
  const exactLectionary = passagePool.find((usfm) => event.calendar.lectionaryRefs.includes(usfm));
  const passageHint = exactLectionary ?? passagePool[
    stableNumber(`${event.sessionHash}:passage:${event.recentPassageIds.length}:${selected.id}`) %
      passagePool.length
  ];

  const snippetCandidates = content.snippetCandidatesFor(selected, event);
  const snippetPool = leastRecentlyUsed(snippetCandidates, event.recentSnippetIds);
  const reflectionSnippetId = snippetPool[
    stableNumber(`${event.sessionHash}:snippet:${event.recentSnippetIds.length}:${selected.id}`) %
      snippetPool.length
  ];
  if (!passageHint || !reflectionSnippetId) throw new Error("Profile has no selectable content");

  const reasonCodes = selectionReasons(event, selected);
  const margin = (ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0);

  return SelectorDecisionSchema.parse({
    momentProfileId: selected.id,
    reflectionSnippetId,
    passageHint,
    durationSeconds: event.estimatedWaitSeconds >= 16 ? 8 : 5,
    tone: selected.tone,
    confidence: Math.min(0.97, 0.72 + Math.max(0, margin) / 10),
    fallbackVotd: false,
    needsAuth: false,
    reasonCodes
  });
}

export function selectionReasons(event: WaitEvent, profile: Profile): string[] {
  const reasons: string[] = [];
  if (profile.task_types.includes(event.taskType)) reasons.push(`task-${event.taskType}`);
  if (event.taskTypes.length > 1) reasons.push("multi-task-context");
  if (profile.workflow_stages?.includes(event.workflowStage)) {
    reasons.push(`workflow-${event.workflowStage}`);
  }
  const observance = profile.observance_ids?.find((id) => event.calendar.observanceIds.includes(id));
  if (observance) reasons.push(`calendar-${observance}`);
  if (profile.liturgical_seasons?.includes(event.calendar.season)) {
    reasons.push(`season-${event.calendar.season}`);
  }
  if (profile.time_windows?.includes(event.timeWindow)) reasons.push(`time-${event.timeWindow}`);
  if (event.preferredProfileIds.includes(profile.id)) reasons.push("feedback-preferred");
  if (event.recentProfileIds.length > 0) reasons.push("repetition-aware");
  if (reasons.length === 0) reasons.push("editorial-default");
  return reasons.slice(0, 8);
}

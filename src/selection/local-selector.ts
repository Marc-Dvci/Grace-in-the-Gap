import {
  SelectorDecisionSchema,
  type Profile,
  type SelectorDecision,
  type WaitEvent
} from "../domain.js";

function stableNumber(seed: string): number {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function selectLocally(event: WaitEvent, candidates: readonly Profile[]): SelectorDecision {
  if (candidates.length === 0) throw new Error("No eligible moment profiles");
  const weighted = candidates.flatMap((profile) => {
    const slots = Math.max(1, Math.round(profile.weight * 4));
    return Array.from({ length: slots }, () => profile);
  });
  const selected = weighted[stableNumber(`${event.sessionHash}:${event.taskType}:${event.timeWindow}`) % weighted.length];
  if (!selected) throw new Error("Unable to choose a moment profile");

  return SelectorDecisionSchema.parse({
    momentProfileId: selected.id,
    reflectionSnippetId: selected.snippet_id,
    passageHint: selected.passage_hint,
    durationSeconds: event.estimatedWaitSeconds >= 16 ? 8 : 5,
    tone: selected.tone,
    confidence: 0.82,
    fallbackVotd: false,
    needsAuth: false
  });
}

import type { PolicyState, Preferences, WaitEvent } from "./domain.js";

export type PolicyReason = "eligible" | "disabled" | "short-wait" | "cooldown" | "daily-cap";

export interface PolicyDecision {
  show: boolean;
  reason: PolicyReason;
}

export function evaluatePolicy(
  event: WaitEvent,
  preferences: Preferences,
  state: PolicyState,
  now: Date
): PolicyDecision {
  if (!preferences.enabled) return { show: false, reason: "disabled" };
  if (preferences.demoAlways) return { show: true, reason: "eligible" };
  if (event.estimatedWaitSeconds < preferences.minimumWaitSeconds) {
    return { show: false, reason: "short-wait" };
  }
  if (preferences.maxCardsPerDay === 0 || state.shownToday >= preferences.maxCardsPerDay) {
    return { show: false, reason: "daily-cap" };
  }
  if (state.lastShownAt) {
    const elapsed = now.getTime() - new Date(state.lastShownAt).getTime();
    if (elapsed < preferences.cooldownMinutes * 60_000) {
      return { show: false, reason: "cooldown" };
    }
  }
  return { show: true, reason: "eligible" };
}

export function recordShown(state: PolicyState, now: Date): PolicyState {
  return {
    // `loadPolicyState` already resolved this date in the user's IANA time
    // zone. Keeping it avoids a UTC/local rollover mismatch around midnight.
    date: state.date,
    shownToday: state.shownToday + 1,
    lastShownAt: now.toISOString()
  };
}

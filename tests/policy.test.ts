import { describe, expect, it } from "vitest";
import { PreferencesSchema, WaitEventSchema } from "../src/domain.js";
import { evaluatePolicy, recordShown } from "../src/policy.js";

const now = new Date("2026-07-18T12:00:00Z");
const event = WaitEventSchema.parse({
  surface: "demo",
  taskType: "testing",
  estimatedWaitSeconds: 12,
  durationBucket: "8-15",
  locale: "en-US",
  timeWindow: "afternoon",
  sessionHash: "policy-session",
  contextMode: "private"
});
const preferences = PreferencesSchema.parse({});

describe("interruption policy", () => {
  it("shows an eligible long wait", () => {
    expect(evaluatePolicy(event, preferences, {
      date: "2026-07-18", shownToday: 0, lastShownAt: null
    }, now)).toEqual({ show: true, reason: "eligible" });
  });

  it("enforces cooldown and daily cap", () => {
    const recent = recordShown({ date: "2026-07-18", shownToday: 0, lastShownAt: null }, now);
    expect(evaluatePolicy(event, preferences, recent, new Date(now.getTime() + 60_000)).reason).toBe("cooldown");
    expect(evaluatePolicy(event, preferences, {
      date: "2026-07-18", shownToday: preferences.maxCardsPerDay, lastShownAt: null
    }, now).reason).toBe("daily-cap");
  });

  it("allows deterministic demo mode without weakening normal defaults", () => {
    const demo = PreferencesSchema.parse({ ...preferences, demoAlways: true, enabled: true });
    expect(evaluatePolicy({ ...event, estimatedWaitSeconds: 0 }, demo, {
      date: "2026-07-18", shownToday: 999, lastShownAt: now.toISOString()
    }, now)).toEqual({ show: true, reason: "eligible" });
  });
});

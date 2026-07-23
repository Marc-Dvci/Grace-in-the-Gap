import { describe, expect, it } from "vitest";
import { normalizeClaudeHook } from "../src/privacy/normalize.js";

const baseInput = {
  session_id: "session-123",
  hook_event_name: "UserPromptSubmit" as const,
  prompt: "Debug SECRET_CUSTOMER_PROMPT in the entire codebase and add tests"
};

describe("Claude hook normalization", () => {
  it("keeps only coarse local labels and never returns raw prompt text", () => {
    const event = normalizeClaudeHook(baseInput, {
      locale: "en-US",
      timeZone: "Europe/Paris",
      tradition: "ecumenical",
      preferredTone: "balanced",
      contextMode: "local-labels",
      now: new Date("2026-07-18T16:00:00Z")
    });
    expect(event.taskType).toBe("debugging");
    expect(event.taskTypes).toEqual(expect.arrayContaining(["debugging", "testing"]));
    expect(event.estimatedWaitSeconds).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(event)).not.toContain("SECRET_CUSTOMER_PROMPT");
    expect(event.sessionHash).not.toBe(baseInput.session_id);
  });

  it("does not classify prompt content in private mode", () => {
    const event = normalizeClaudeHook(baseInput, {
      locale: "en-US",
      timeZone: "UTC",
      tradition: "ecumenical",
      preferredTone: "balanced",
      contextMode: "private",
      now: new Date("2026-07-18T16:00:00Z")
    });
    expect(event.taskType).toBe("unknown");
    expect(JSON.stringify(event)).not.toContain("SECRET_CUSTOMER_PROMPT");
  });

  it("skips slash commands as non-wait states", () => {
    const event = normalizeClaudeHook({ ...baseInput, prompt: "/help" }, {
      locale: "en-US",
      timeZone: "UTC",
      tradition: "ecumenical",
      preferredTone: "balanced",
      contextMode: "local-labels"
    });
    expect(event.estimatedWaitSeconds).toBe(0);
    expect(event.durationBucket).toBe("under-8");
  });
});

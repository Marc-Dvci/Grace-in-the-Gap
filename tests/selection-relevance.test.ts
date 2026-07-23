import { describe, expect, it } from "vitest";
import { ContentRepository } from "../src/content/repository.js";
import { buildManualEvent } from "../src/privacy/normalize.js";
import { selectLocally } from "../src/selection/local-selector.js";

const content = new ContentRepository();

function decide(options: Parameters<typeof buildManualEvent>[0]) {
  const event = buildManualEvent(options);
  return { event, decision: selectLocally(event, content.candidatesFor(event)) };
}

describe("contextual selector relevance", () => {
  it("responds to retrying, completion, and preferred tone", () => {
    const retrying = decide({
      taskType: "debugging",
      locale: "en-US",
      sessionSeed: "retry",
      workflowStage: "stuck",
      lastOutcome: "failure",
      repeatBucket: "three-plus",
      now: new Date("2026-07-18T14:00:00Z")
    }).decision;
    expect(retrying.momentProfileId).toBe("perseverance-in-retrying");
    expect(retrying.reasonCodes).toContain("workflow-stuck");

    const completed = decide({
      taskType: "implementation",
      locale: "en-US",
      sessionSeed: "complete",
      workflowStage: "completed",
      lastOutcome: "success",
      now: new Date("2026-07-18T14:00:00Z")
    }).decision;
    expect(completed.momentProfileId).toBe("gratitude-after-progress");

    const calm = decide({
      taskType: "analysis",
      locale: "en-US",
      sessionSeed: "calm",
      preferredTone: "calm",
      now: new Date("2026-07-18T14:00:00Z")
    }).decision;
    expect(content.findProfile(calm.momentProfileId)?.tone).toBe("calm");
  });

  it("gives an exact feast lectionary passage priority", () => {
    const { event, decision } = decide({
      taskType: "debugging",
      locale: "en-US",
      sessionSeed: "mary-magdalene",
      timeZone: "Europe/Paris",
      now: new Date("2026-07-22T10:00:00Z")
    });
    expect(event.calendar.observanceIds).toContain("mary-magdalene");
    expect(decision.momentProfileId).toBe("today-in-the-church-year");
    expect(decision.passageHint).toBe("JHN.20.16-18");
    expect(decision.reasonCodes).toContain("calendar-mary-magdalene");

    const today = decide({
      taskType: "analysis",
      locale: "en-US",
      sessionSeed: "bridget",
      tradition: "catholic",
      timeZone: "Europe/Paris",
      now: new Date("2026-07-23T10:00:00Z")
    }).decision;
    expect(today.momentProfileId).toBe("today-in-the-church-year");
    expect(today.passageHint).toBe("JHN.15.4-5");
  });

  it("selects seasonal and late-work moments only when applicable", () => {
    const advent = decide({
      taskType: "planning",
      locale: "en-US",
      sessionSeed: "advent",
      now: new Date("2026-12-10T14:00:00Z")
    }).decision;
    expect(advent.momentProfileId).toBe("season-of-advent");

    const late = decide({
      taskType: "testing",
      locale: "en-US",
      sessionSeed: "late",
      now: new Date("2026-07-18T23:00:00Z")
    }).decision;
    expect(late.momentProfileId).toBe("rest-for-late-work");
  });

  it("avoids recently shown profiles, passages, and reflection snippets", () => {
    const first = decide({
      taskType: "analysis",
      locale: "fr-FR",
      sessionSeed: "history",
      now: new Date("2026-07-18T14:00:00Z")
    }).decision;
    const second = decide({
      taskType: "analysis",
      locale: "fr-FR",
      sessionSeed: "history",
      recentProfileIds: [first.momentProfileId],
      recentPassageIds: [first.passageHint],
      recentSnippetIds: [first.reflectionSnippetId],
      now: new Date("2026-07-18T14:00:00Z")
    }).decision;

    expect(second.momentProfileId).not.toBe(first.momentProfileId);
    expect(second.passageHint).not.toBe(first.passageHint);
    expect(second.reflectionSnippetId).not.toBe(first.reflectionSnippetId);
    expect(content.getSnippet(second.reflectionSnippetId, "fr-FR").locale).toBe("fr-FR");
    expect(second.reasonCodes).toContain("repetition-aware");
  });

  it("applies local ratings without allowing them to escape the approved catalog", () => {
    const { event, decision } = decide({
      taskType: "analysis",
      locale: "en-US",
      sessionSeed: "feedback",
      preferredProfileIds: ["thoughtful-review"],
      avoidedProfileIds: ["quiet-trust"],
      avoidedPassageIds: ["PHP.4.8"],
      now: new Date("2026-07-18T14:00:00Z")
    });
    const profile = content.findProfile(decision.momentProfileId);
    expect(decision.momentProfileId).toBe("thoughtful-review");
    expect(decision.passageHint).not.toBe("PHP.4.8");
    expect(profile?.passage_hints).toContain(decision.passageHint);
    expect(content.candidatesFor(event)).toContainEqual(profile);
  });
});

import { describe, expect, it } from "vitest";
import { ContentRepository } from "../src/content/repository.js";
import { buildManualEvent } from "../src/privacy/normalize.js";

describe("editorial catalog", () => {
  it("has resolvable, attributed content for every profile", () => {
    const content = new ContentRepository();
    expect(content.profiles.length).toBeGreaterThanOrEqual(15);
    for (const profile of content.profiles) {
      for (const snippetId of profile.snippet_ids) {
        expect(content.getSnippet(snippetId, "en-US").status).toBe("approved-for-demo");
        expect(content.getSnippet(snippetId, "fr-FR").locale).toBe("fr-FR");
      }
      for (const passageHint of profile.passage_hints) {
        expect(content.referenceFor(passageHint)).not.toBe(passageHint);
      }
      // The broad passage catalog is resolved live. Each profile also has a
      // small, attributed public-domain emergency fallback.
      const passage = content.getOfflinePassage(profile.fallback_passage_hint, "en-US");
      expect(passage.copyright).toContain("Public Domain");
      expect(passage.text.length).toBeGreaterThan(0);
    }
  });

  it("keeps time-windowed rest content out of daytime selection", () => {
    const content = new ContentRepository();
    const daytime = buildManualEvent({
      taskType: "debugging", locale: "en-US", sessionSeed: "day",
      timeZone: "UTC", now: new Date("2026-07-18T14:00:00Z")
    });
    const late = buildManualEvent({
      taskType: "debugging", locale: "en-US", sessionSeed: "late",
      timeZone: "UTC", now: new Date("2026-07-18T23:00:00Z")
    });
    expect(daytime.timeWindow).toBe("afternoon");
    expect(late.timeWindow).toBe("late-evening");
    expect(content.candidatesFor(daytime).some((profile) => profile.id === "rest-for-late-work")).toBe(false);
    expect(content.candidatesFor(late).some((profile) => profile.id === "rest-for-late-work")).toBe(true);
  });

  it("keeps calendar anchors short enough for a micro-moment", () => {
    const content = new ContentRepository();
    const calendar = content.findProfile("today-in-the-church-year");
    expect(calendar).toBeDefined();
    for (const usfm of calendar?.passage_hints ?? []) {
      if (usfm === calendar?.fallback_passage_hint) continue;
      const match = usfm.match(/\.(\d+)(?:-(\d+))?$/);
      expect(match).not.toBeNull();
      const start = Number(match?.[1]);
      const end = Number(match?.[2] ?? match?.[1]);
      expect(end - start + 1).toBeLessThanOrEqual(5);
    }
  });
});

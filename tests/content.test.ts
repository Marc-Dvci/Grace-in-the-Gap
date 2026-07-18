import { describe, expect, it } from "vitest";
import { ContentRepository } from "../src/content/repository.js";

describe("editorial catalog", () => {
  it("has resolvable, attributed content for every profile", () => {
    const content = new ContentRepository();
    expect(content.profiles.length).toBeGreaterThanOrEqual(8);
    for (const profile of content.profiles) {
      expect(content.getSnippet(profile.snippet_id, "en-US").status).toBe("approved-for-demo");
      // Every profile resolves to a human-readable reference and a bundled
      // public-domain offline passage with attribution.
      expect(content.referenceFor(profile.passage_hint)).not.toBe(profile.passage_hint);
      const passage = content.getOfflinePassage(profile.passage_hint, "en-US");
      expect(passage.copyright).toContain("Public Domain");
      expect(passage.text.length).toBeGreaterThan(0);
    }
  });

  it("keeps time-windowed rest content out of daytime selection", () => {
    const content = new ContentRepository();
    const daytime = content.candidatesFor({ taskType: "debugging", timeWindow: "afternoon" });
    const late = content.candidatesFor({ taskType: "debugging", timeWindow: "late-evening" });
    expect(daytime.some((profile) => profile.id === "rest-for-late-work")).toBe(false);
    expect(late.some((profile) => profile.id === "rest-for-late-work")).toBe(true);
  });
});

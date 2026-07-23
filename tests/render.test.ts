import { describe, expect, it } from "vitest";
import { MomentExperienceSchema } from "../src/domain.js";
import { providerLabel, renderTerminalCard } from "../src/render.js";

function moment(selectorLive: boolean, scriptureLive: boolean) {
  return MomentExperienceSchema.parse({
    traceId: "00d2c3b1-bc3d-42c5-b63d-116707f7f111",
    createdAt: "2026-07-23T12:00:00.000Z",
    durationSeconds: 5,
    tone: "reflective",
    reflection: "Make room for wisdom before looking again.",
    reflectionLocale: "en-US",
    passage: {
      usfm: "JAS.1.5",
      reference: "James 1:5",
      text: "If any of you lacks wisdom, let him ask of God.",
      versionId: "3034",
      versionName: "Test Bible",
      copyright: `Publisher ${"X".repeat(150)} Public Domain`,
      locale: "en"
    },
    selection: {
      profileId: "wisdom-in-debugging",
      snippetId: "make-room-for-wisdom",
      passageId: "JAS.1.5",
      themes: ["wisdom"],
      reasonCodes: ["task-debugging", "workflow-retrying", "repetition-aware"],
      explanationVisible: true
    },
    provenance: {
      selector: selectorLive ? "gloo-tools" : "local-rule-fallback",
      scripture: scriptureLive ? "youversion-rest" : "web-offline-fallback",
      selectorLive,
      scriptureLive,
      live: selectorLive && scriptureLive,
      degraded: !selectorLive || !scriptureLive,
      contentRelease: "test",
      citations: []
    },
    privacy: {
      rawPromptStored: false,
      rawPromptTransmitted: false,
      telemetryEnabled: false
    }
  });
}

describe("card rendering and provenance", () => {
  it("labels every live/fallback combination honestly", () => {
    expect(providerLabel(moment(true, true))).toBe("GLOO + YOUVERSION");
    expect(providerLabel(moment(false, true))).toBe("LOCAL SELECTOR + YOUVERSION");
    expect(providerLabel(moment(true, false))).toBe("GLOO + PUBLIC DOMAIN");
    expect(providerLabel(moment(false, false))).toBe("LOCAL + PUBLIC DOMAIN");
  });

  it("bounds long attribution and identifiers inside the terminal card", () => {
    const rendered = renderTerminalCard(moment(true, true));
    expect(rendered).toContain("Why this moment: debugging");
    expect(rendered).toContain("Feedback ID: 00d2c3b1");
    for (const line of rendered.trim().split("\n")) {
      expect([...line].length).toBeLessThanOrEqual(74);
    }
  });
});

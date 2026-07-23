import { describe, expect, it } from "vitest";
import {
  buildMomentSpinnerPatch,
  buildSpinnerPatch,
  mergeSpinnerSettings
} from "../src/installer/spinner-settings.js";
import { MomentExperienceSchema } from "../src/domain.js";

describe("official Claude spinner settings", () => {
  it("adds five-second-style Grace tips without deleting existing settings", () => {
    const merged = mergeSpinnerSettings({
      model: "sonnet",
      spinnerTipsOverride: { excludeDefault: false, tips: ["Existing tip"] },
      spinnerVerbs: { mode: "replace", verbs: ["Existing"] }
    });
    expect(merged.model).toBe("sonnet");
    const override = merged.spinnerTipsOverride as { excludeDefault: boolean; tips: string[] };
    expect(override.excludeDefault).toBe(true);
    expect(override.tips).toContain("Existing tip");
    expect(override.tips.some((tip) => tip.startsWith("Grace ·"))).toBe(true);
    const verbs = merged.spinnerVerbs as { mode: string; verbs: string[] };
    expect(verbs).toEqual({ mode: "append", verbs: ["Existing", "Pausing", "Breathing", "Reflecting"] });
  });

  it("uses human references and owned reflections, not verse text, in static spinner tips", () => {
    const patch = buildSpinnerPatch();
    const serialized = JSON.stringify(patch);
    expect(serialized).toContain("Psalm 46:10");
    expect(serialized).not.toContain("Be still, and know");
  });

  it("builds a fully attributed provider-selected spinner tip", () => {
    const moment = MomentExperienceSchema.parse({
      traceId: "00d2c3b1-bc3d-42c5-b63d-116707f7f111",
      createdAt: "2026-07-18T12:00:00.000Z",
      durationSeconds: 5,
      tone: "calm",
      reflection: "One slow breath.",
      reflectionLocale: "en-US",
      passage: {
        usfm: "PSA.46.10", reference: "Psalm 46:10", text: "Be still.",
        versionId: "3034", versionName: "BSB", copyright: "Berean Standard Bible — Public Domain", locale: "en-US"
      },
      selection: {
        profileId: "debug-with-wisdom",
        snippetId: "pause-and-release",
        passageId: "PSA.46.10",
        themes: ["wisdom"],
        reasonCodes: ["task-match"],
        explanationVisible: true
      },
      provenance: {
        selector: "gloo-v2-tools", scripture: "youversion-rest",
        selectorLive: true, scriptureLive: true,
        live: true, degraded: false, contentRelease: "test", citations: []
      },
      privacy: { rawPromptStored: false, rawPromptTransmitted: false, telemetryEnabled: false }
    });
    const serialized = JSON.stringify(buildMomentSpinnerPatch(moment));
    expect(serialized).toContain("Psalm 46:10");
    expect(serialized).toContain("Public Domain");
    expect(serialized).toContain("GLOO + YOUVERSION");
    expect(serialized).not.toContain("Be still.");
  });
});

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GraceDataStore } from "../src/data/store.js";
import { MomentExperienceSchema } from "../src/domain.js";

function fixtureMoment(traceId: string, profileId = "quiet-trust", passageId = "PSA.46.10") {
  return MomentExperienceSchema.parse({
    traceId,
    createdAt: "2026-07-23T12:00:00.000Z",
    durationSeconds: 5,
    tone: "calm",
    reflection: "A locally owned reflection.",
    reflectionLocale: "en-US",
    passage: {
      usfm: passageId,
      reference: "Psalm 46:10",
      text: "A public-domain fixture verse.",
      versionId: "987",
      versionName: "Test Bible",
      copyright: "Public Domain",
      locale: "en"
    },
    selection: {
      profileId,
      snippetId: "pause-and-release",
      passageId,
      themes: ["trust"],
      reasonCodes: ["task-analysis"],
      explanationVisible: true
    },
    provenance: {
      selector: "local-rule-fallback",
      scripture: "web-offline-fallback",
      selectorLive: false,
      scriptureLive: false,
      live: false,
      degraded: true,
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

describe("local history and feedback store", () => {
  it("learns approved-ID preferences without storing card text", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grace-feedback-"));
    const store = new GraceDataStore(directory);
    const disliked = fixtureMoment("00d2c3b1-bc3d-42c5-b63d-116707f7f111");
    const liked = fixtureMoment(
      "10d2c3b1-bc3d-42c5-b63d-116707f7f222",
      "thoughtful-review",
      "PHP.4.8"
    );
    await store.recordPresentedMoment(disliked);
    await store.recordPresentedMoment(liked);
    await store.recordFeedback(disliked.traceId.slice(0, 8), 1);
    await store.recordFeedback(liked.traceId.slice(0, 8), 5);

    expect(await store.loadFeedbackContext()).toEqual({
      preferredProfileIds: ["thoughtful-review"],
      avoidedProfileIds: ["quiet-trust"],
      avoidedPassageIds: ["PSA.46.10"]
    });

    const stored = await readFile(join(directory, "feedback-state.json"), "utf8");
    expect(stored).not.toContain(disliked.reflection);
    expect(stored).not.toContain(disliked.passage.text);
    expect(stored).not.toContain(disliked.passage.copyright);
  });

  it("resets daily policy by the configured civil timezone, not UTC", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grace-timezone-"));
    const store = new GraceDataStore(directory);
    await store.savePolicyState({
      date: "2026-07-22",
      shownToday: 3,
      lastShownAt: "2026-07-22T20:00:00.000Z"
    });
    const sameParisDay = await store.loadPolicyState(
      new Date("2026-07-22T22:30:00.000Z"),
      "Europe/Paris"
    );
    expect(sameParisDay.date).toBe("2026-07-23");
    expect(sameParisDay.shownToday).toBe(0);
  });

  it("tracks task repetition even on turns where no card is shown", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grace-session-"));
    const store = new GraceDataStore(directory);
    const first = await store.loadSessionState("session-hash-1234", new Date("2026-07-23T10:00:00Z"));
    const afterOne = await store.recordSessionTurn({
      previous: first,
      taskType: "debugging",
      now: new Date("2026-07-23T10:01:00Z")
    });
    const afterTwo = await store.recordSessionTurn({
      previous: afterOne,
      taskType: "debugging",
      now: new Date("2026-07-23T10:02:00Z")
    });
    expect(afterTwo.turnCount).toBe(2);
    expect(afterTwo.repeatedTaskCount).toBe(1);
    expect(afterTwo.lastTaskType).toBe("debugging");
  });
});

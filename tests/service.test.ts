import { describe, expect, it } from "vitest";
import { ContentRepository } from "../src/content/repository.js";
import type { ScriptureProvider, SelectorProvider } from "../src/domain.js";
import { OfflineScriptureProvider } from "../src/providers/offline.js";
import { buildManualEvent } from "../src/privacy/normalize.js";
import { MomentService } from "../src/service/moment-service.js";

describe("MomentService degradation", () => {
  it("rejects an ungrounded selector choice and a failed Scripture upstream", async () => {
    const content = new ContentRepository();
    const unsafeSelector: SelectorProvider = {
      async select() {
        return {
          decision: {
            momentProfileId: "invented-profile",
            reflectionSnippetId: "pause-and-release",
            passageHint: "PSA.46.10",
            durationSeconds: 5,
            tone: "calm",
            confidence: 0.99,
            fallbackVotd: false,
            needsAuth: false,
            reasonCodes: ["test-unsafe"]
          },
          metadata: { provider: "unsafe-test-selector", live: true, citations: [] }
        };
      }
    };
    const failingScripture: ScriptureProvider = {
      async getPassage() { throw new Error("upstream down"); }
    };
    const service = new MomentService(
      content,
      unsafeSelector,
      failingScripture,
      new OfflineScriptureProvider(content),
      "3034",
      false,
      false
    );
    const moment = await service.create(buildManualEvent({
      taskType: "debugging", locale: "en-US", sessionSeed: "fallback"
    }));

    // The non-catalog profile is rejected and the card degrades on-device to a
    // valid catalog passage (debugging-eligible), never the invented profile.
    expect(moment.provenance.degraded).toBe(true);
    expect(moment.selection.profileId).not.toBe("invented-profile");
    // Live Scripture failed -> bundled public-domain fallback, marked not-live.
    expect(moment.provenance.live).toBe(false);
    expect(moment.provenance.scripture).toBe("web-offline-fallback");
    expect(moment.passage.copyright).toContain("Public Domain");
    expect(moment.privacy).toEqual({
      rawPromptStored: false,
      rawPromptTransmitted: false,
      telemetryEnabled: false
    });
  });

  it("marks a card live when both providers succeed", async () => {
    const content = new ContentRepository();
    const selector: SelectorProvider = {
      async select(_event, candidates) {
        const first = candidates[0]!;
        return {
          decision: {
            momentProfileId: first.id,
            reflectionSnippetId: first.snippet_ids[0]!,
            passageHint: first.passage_hints[0]!,
            durationSeconds: 5,
            tone: first.tone,
            confidence: 0.9,
            fallbackVotd: false,
            needsAuth: false,
            reasonCodes: ["test-live"]
          },
          metadata: { provider: "gloo-v2-tools", live: true, citations: [] }
        };
      }
    };
    const liveScripture: ScriptureProvider = {
      async getPassage(versionId, usfm, locale) {
        return {
          passage: {
            usfm, reference: "Reference 1:1", text: "Live verse text.",
            versionId, versionName: "BSB", copyright: "Public Domain", locale
          },
          metadata: { provider: "youversion-rest", live: true, citations: [] }
        };
      }
    };
    const service = new MomentService(
      content, selector, liveScripture, new OfflineScriptureProvider(content), "3034", false, true
    );
    const moment = await service.create(buildManualEvent({
      taskType: "debugging", locale: "en-US", sessionSeed: "happy"
    }));
    expect(moment.provenance.degraded).toBe(false);
    expect(moment.provenance.live).toBe(true);
    expect(moment.provenance.selectorLive).toBe(true);
    expect(moment.provenance.scriptureLive).toBe(true);
    expect(moment.provenance.scripture).toBe("youversion-rest");
    expect(moment.selection.explanationVisible).toBe(true);
    expect(moment.selection.reasonCodes).toContain("task-debugging");
    expect(moment.selection.reasonCodes).not.toContain("test-live");
  });
});

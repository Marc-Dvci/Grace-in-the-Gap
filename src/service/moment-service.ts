import { randomUUID } from "node:crypto";
import { ContentRepository } from "../content/repository.js";
import {
  MomentExperienceSchema,
  type MomentExperience,
  type Profile,
  type ScriptureProvider,
  type SelectorDecision,
  type SelectorProvider,
  type WaitEvent
} from "../domain.js";
import { selectionReasons, selectLocally } from "../selection/local-selector.js";

export class MomentService {
  constructor(
    private readonly content: ContentRepository,
    private readonly selector: SelectorProvider,
    private readonly scripture: ScriptureProvider,
    // Bundled public-domain fallback, used only when the live Scripture API fails.
    private readonly offlineScripture: ScriptureProvider,
    private readonly bibleVersionId: string,
    private readonly telemetryEnabled: boolean,
    private readonly showSelectionReason: boolean
  ) {}

  async create(event: WaitEvent): Promise<MomentExperience> {
    const candidates = this.content.candidatesFor(event).map((profile) => ({
      ...profile,
      passage_hints: this.content.passageCandidatesFor(profile, event),
      snippet_ids: this.content.snippetCandidatesFor(profile, event)
    }));
    const selectorResult = await this.selectSafely(event, candidates);
    const validated = this.validateGroundedDecision(selectorResult.decision, candidates);
    const preliminaryDecision = validated ?? selectLocally(event, candidates);
    const selectorLive = selectorResult.live && Boolean(validated);
    const selectorDegraded = selectorResult.degraded || !validated || !selectorLive;
    const selectedProfile = candidates.find((candidate) => {
      return candidate.id === preliminaryDecision.momentProfileId;
    });
    if (!selectedProfile) throw new Error("Selected profile was not in the eligible candidate set");
    // The model must return reason codes for contract observability, but UI
    // explanations are re-derived from validated local facts so they can never
    // overstate what actually matched.
    const decision = validated
      ? {
          ...preliminaryDecision,
          reasonCodes: selectionReasons(event, selectedProfile)
        }
      : preliminaryDecision;

    let scriptureResult;
    let scriptureDegraded = false;
    try {
      scriptureResult = await this.scripture.getPassage(
        this.bibleVersionId,
        decision.passageHint,
        event.locale
      );
    } catch {
      scriptureDegraded = true;
      try {
        scriptureResult = await this.offlineScripture.getPassage(
          this.bibleVersionId,
          decision.passageHint,
          event.locale
        );
      } catch {
        scriptureResult = await this.offlineScripture.getPassage(
          this.bibleVersionId,
          selectedProfile.fallback_passage_hint,
          event.locale
        );
      }
    }

    const snippet = this.content.getSnippet(decision.reflectionSnippetId, event.locale);
    const scriptureLive = scriptureResult.metadata.live;
    return MomentExperienceSchema.parse({
      traceId: randomUUID(),
      createdAt: new Date().toISOString(),
      durationSeconds: decision.durationSeconds,
      tone: decision.tone,
      reflection: snippet.text,
      reflectionLocale: snippet.locale,
      passage: scriptureResult.passage,
      selection: {
        profileId: selectedProfile.id,
        snippetId: snippet.id,
        passageId: scriptureResult.passage.usfm,
        themes: selectedProfile.themes,
        reasonCodes: decision.reasonCodes,
        explanationVisible: this.showSelectionReason
      },
      provenance: {
        selector: selectorResult.provider,
        scripture: scriptureResult.metadata.provider,
        selectorLive,
        scriptureLive,
        live: selectorLive && scriptureLive,
        degraded: selectorDegraded || scriptureDegraded,
        contentRelease: this.content.release,
        citations: [...selectorResult.citations, ...scriptureResult.metadata.citations]
      },
      privacy: {
        rawPromptStored: false,
        rawPromptTransmitted: false,
        telemetryEnabled: this.telemetryEnabled
      }
    });
  }

  private async selectSafely(event: WaitEvent, candidates: readonly Profile[]): Promise<{
    decision: SelectorDecision;
    provider: string;
    citations: string[];
    live: boolean;
    degraded: boolean;
  }> {
    try {
      const result = await this.selector.select(event, candidates);
      return {
        decision: result.decision,
        provider: result.metadata.provider,
        citations: result.metadata.citations,
        live: result.metadata.live,
        degraded: false
      };
    } catch {
      return {
        decision: selectLocally(event, candidates),
        provider: "local-rule-fallback",
        citations: [],
        live: false,
        degraded: true
      };
    }
  }

  private validateGroundedDecision(
    decision: SelectorDecision,
    candidates: readonly Profile[]
  ): SelectorDecision | undefined {
    if (decision.confidence < 0.55 || decision.needsAuth || decision.fallbackVotd) return undefined;
    const profile = candidates.find((candidate) => candidate.id === decision.momentProfileId);
    if (!profile) return undefined;
    if (
      !profile.snippet_ids.includes(decision.reflectionSnippetId) ||
      !profile.passage_hints.includes(decision.passageHint) ||
      profile.tone !== decision.tone
    ) {
      return undefined;
    }
    return decision;
  }
}

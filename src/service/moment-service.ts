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
import { selectLocally } from "../selection/local-selector.js";

export class MomentService {
  constructor(
    private readonly content: ContentRepository,
    private readonly selector: SelectorProvider,
    private readonly scripture: ScriptureProvider,
    // Bundled public-domain fallback, used only when the live Scripture API fails.
    private readonly offlineScripture: ScriptureProvider,
    private readonly bibleVersionId: string,
    private readonly telemetryEnabled: boolean
  ) {}

  async create(event: WaitEvent): Promise<MomentExperience> {
    const candidates = this.content.candidatesFor(event);
    const selectorResult = await this.selectSafely(event, candidates);
    const validated = this.validateGroundedDecision(selectorResult.decision, candidates);
    const decision = validated ?? selectLocally(event, candidates);
    const selectorDegraded = selectorResult.degraded || !validated;

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
      scriptureResult = await this.offlineScripture.getPassage(
        this.bibleVersionId,
        decision.passageHint,
        event.locale
      );
    }

    const snippet = this.content.getSnippet(decision.reflectionSnippetId, event.locale);
    return MomentExperienceSchema.parse({
      traceId: randomUUID(),
      createdAt: new Date().toISOString(),
      durationSeconds: decision.durationSeconds,
      tone: decision.tone,
      reflection: snippet.text,
      passage: scriptureResult.passage,
      provenance: {
        selector: selectorResult.provider,
        scripture: scriptureResult.metadata.provider,
        live: scriptureResult.metadata.live,
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
    degraded: boolean;
  }> {
    try {
      const result = await this.selector.select(event, candidates);
      return {
        decision: result.decision,
        provider: result.metadata.provider,
        citations: result.metadata.citations,
        degraded: false
      };
    } catch {
      return {
        decision: selectLocally(event, candidates),
        provider: "local-rule-fallback",
        citations: [],
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
      profile.snippet_id !== decision.reflectionSnippetId ||
      profile.passage_hint !== decision.passageHint ||
      profile.tone !== decision.tone
    ) {
      return undefined;
    }
    return decision;
  }
}

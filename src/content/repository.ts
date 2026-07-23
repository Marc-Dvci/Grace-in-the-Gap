import rawCatalog from "../../content/catalog.json" with { type: "json" };
import {
  CatalogSchema,
  type Passage,
  type PassageHint,
  type Profile,
  type Snippet,
  type TaskType,
  type WaitEvent
} from "../domain.js";

const catalog = CatalogSchema.parse(rawCatalog);

export class ContentRepository {
  readonly release = catalog.release;
  readonly reviewNotice = catalog.review_notice;
  readonly profiles: readonly Profile[] = catalog.profiles;

  private readonly snippets = new Map<string, Map<string, Snippet>>();
  private readonly passageHints = new Map(catalog.passage_hints.map((item) => [item.usfm, item]));
  private readonly offlinePassages = new Map(catalog.offline_passages.map((item) => [item.usfm, item]));

  constructor() {
    for (const snippet of catalog.snippets) {
      const locales = this.snippets.get(snippet.id) ?? new Map<string, Snippet>();
      if (locales.has(snippet.locale)) {
        throw new Error(`Duplicate snippet locale: ${snippet.id}/${snippet.locale}`);
      }
      locales.set(snippet.locale, snippet);
      this.snippets.set(snippet.id, locales);
    }

    const profileIds = new Set<string>();
    for (const profile of this.profiles) {
      if (profileIds.has(profile.id)) {
        throw new Error(`Duplicate profile id: ${profile.id}`);
      }
      profileIds.add(profile.id);
      for (const snippetId of profile.snippet_ids) {
        if (!this.snippets.has(snippetId)) {
          throw new Error(`Profile ${profile.id} references missing snippet ${snippetId}`);
        }
      }
      for (const usfm of profile.passage_hints) {
        if (!this.passageHints.has(usfm)) {
          throw new Error(`Profile ${profile.id} references unknown passage ${usfm}`);
        }
      }
      if (!profile.passage_hints.includes(profile.fallback_passage_hint)) {
        throw new Error(`Profile ${profile.id} fallback must be one of its passage hints`);
      }
      if (!this.offlinePassages.has(profile.fallback_passage_hint)) {
        throw new Error(`Profile ${profile.id} fallback has no bundled public-domain text`);
      }
    }
  }

  findProfile(id: string): Profile | undefined {
    return this.profiles.find((profile) => profile.id === id);
  }

  getSnippet(id: string, locale: string): Snippet {
    const locales = this.snippets.get(id);
    if (!locales) throw new Error(`Unknown snippet id: ${id}`);
    const normalized = locale.toLowerCase();
    const language = normalized.split("-")[0] ?? normalized;
    const exact = [...locales.entries()].find(([candidate]) => candidate.toLowerCase() === normalized)?.[1];
    const languageMatch = [...locales.values()].find((candidate) => {
      return candidate.locale.toLowerCase().split("-")[0] === language;
    });
    const fallback = locales.get("en-US") ?? locales.values().next().value;
    const selected = exact ?? languageMatch ?? fallback;
    if (!selected) throw new Error(`Snippet ${id} has no locale`);
    return selected;
  }

  /** Human-readable reference (e.g. "Psalm 46:10") for a USFM passage hint. */
  referenceFor(usfm: string): string {
    return this.passageHints.get(usfm)?.reference ?? this.offlinePassages.get(usfm)?.reference ?? usfm;
  }

  getPassageHint(usfm: string): PassageHint {
    const hint = this.passageHints.get(usfm);
    if (!hint) throw new Error(`Unknown passage hint: ${usfm}`);
    return hint;
  }

  /**
   * Bundled public-domain (World English Bible) verse used only as an offline
   * fallback when the live YouVersion API is unreachable at runtime.
   */
  getOfflinePassage(usfm: string, _locale: string): Passage {
    const fixture = this.offlinePassages.get(usfm);
    if (!fixture) throw new Error(`No offline passage bundled for ${usfm}`);
    return {
      usfm: fixture.usfm,
      reference: fixture.reference,
      text: fixture.text,
      versionId: fixture.version_id,
      versionName: fixture.version_name,
      copyright: fixture.copyright,
      locale: fixture.locale
    };
  }

  candidatesFor(completeEvent: WaitEvent): Profile[] {
    const event = completeEvent;
    return this.profiles
      .filter((profile) => {
        const taskTypes = completeEvent.taskTypes ?? [event.taskType];
        if (!profile.task_types.some((taskType) => taskTypes.includes(taskType))) return false;
        if (
          profile.requires_time_match &&
          (!profile.time_windows || !profile.time_windows.includes(event.timeWindow))
        ) {
          return false;
        }
        if (
          profile.requires_workflow_match &&
          (!profile.workflow_stages || !profile.workflow_stages.includes(completeEvent.workflowStage))
        ) {
          return false;
        }
        if (profile.requires_calendar_match) {
          const seasonMatch = profile.liturgical_seasons?.includes(completeEvent.calendar.season) ?? false;
          const observanceMatch = profile.observance_ids?.some((id) => {
            return completeEvent.calendar.observanceIds.includes(id);
          }) ?? false;
          if (!seasonMatch && !observanceMatch) return false;
        }
        return true;
      })
      .sort((left, right) => this.scoreProfile(completeEvent, right) - this.scoreProfile(completeEvent, left));
  }

  scoreProfile(event: WaitEvent, profile: Profile): number {
    let score = Math.log2(profile.weight + 1);
    if (profile.task_types.includes(event.taskType)) score += 4;
    score += event.taskTypes.filter((taskType) => profile.task_types.includes(taskType)).length * 1.25;
    if (profile.time_windows?.includes(event.timeWindow)) score += 1.5;
    if (profile.workflow_stages?.includes(event.workflowStage)) score += 3;
    if (event.repeatBucket === "three-plus" && profile.themes.includes("perseverance")) score += 2;
    if (event.lastOutcome === "success" && profile.themes.includes("gratitude")) score += 3;
    if (event.preferredTone !== "balanced" && profile.tone === event.preferredTone) score += 2.5;
    if (profile.liturgical_seasons?.includes(event.calendar.season)) score += 2;
    if (profile.observance_ids?.some((id) => event.calendar.observanceIds.includes(id))) score += 6;
    if (event.recentProfileIds.includes(profile.id)) score -= 4;
    if (event.preferredProfileIds.includes(profile.id)) score += 3;
    if (event.avoidedProfileIds.includes(profile.id)) score -= 10;
    return score;
  }

  passageCandidatesFor(profile: Profile, event: WaitEvent): string[] {
    return [...profile.passage_hints].sort((left, right) => {
      const score = (usfm: string) => {
        const hint = this.getPassageHint(usfm);
        let value = 0;
        if (event.calendar.lectionaryRefs.includes(usfm)) value += 12;
        if (hint.observance_ids?.some((id) => event.calendar.observanceIds.includes(id))) value += 8;
        if (event.recentPassageIds.includes(usfm)) value -= 20;
        if (event.avoidedPassageIds.includes(usfm)) value -= 30;
        return value;
      };
      return score(right) - score(left) || left.localeCompare(right);
    });
  }

  snippetCandidatesFor(profile: Profile, event: WaitEvent): string[] {
    return [...profile.snippet_ids].sort((left, right) => {
      const leftRecent = event.recentSnippetIds.includes(left) ? 1 : 0;
      const rightRecent = event.recentSnippetIds.includes(right) ? 1 : 0;
      return leftRecent - rightRecent || left.localeCompare(right);
    });
  }

  taskTypes(): TaskType[] {
    const values = new Set<TaskType>();
    for (const profile of this.profiles) {
      for (const taskType of profile.task_types) values.add(taskType);
    }
    return [...values];
  }
}

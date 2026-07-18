import rawCatalog from "../../content/catalog.json" with { type: "json" };
import {
  CatalogSchema,
  type Passage,
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

  private readonly snippets = new Map(catalog.snippets.map((item) => [item.id, item]));
  private readonly offlinePassages = new Map(catalog.offline_passages.map((item) => [item.usfm, item]));

  constructor() {
    const profileIds = new Set<string>();
    for (const profile of this.profiles) {
      if (profileIds.has(profile.id)) {
        throw new Error(`Duplicate profile id: ${profile.id}`);
      }
      profileIds.add(profile.id);
      if (!this.snippets.has(profile.snippet_id)) {
        throw new Error(`Profile ${profile.id} references missing snippet ${profile.snippet_id}`);
      }
      if (!this.offlinePassages.has(profile.passage_hint)) {
        throw new Error(`Profile ${profile.id} references unknown passage ${profile.passage_hint}`);
      }
    }
  }

  findProfile(id: string): Profile | undefined {
    return this.profiles.find((profile) => profile.id === id);
  }

  getSnippet(id: string, locale: string): Snippet {
    const snippet = this.snippets.get(id);
    if (!snippet) throw new Error(`Unknown snippet id: ${id}`);
    if (snippet.locale !== locale && locale !== "en-US") {
      return snippet;
    }
    return snippet;
  }

  /** Human-readable reference (e.g. "Psalm 46:10") for a USFM passage hint. */
  referenceFor(usfm: string): string {
    return this.offlinePassages.get(usfm)?.reference ?? usfm;
  }

  /**
   * Bundled public-domain (World English Bible) verse used only as an offline
   * fallback when the live YouVersion API is unreachable at runtime.
   */
  getOfflinePassage(usfm: string, locale: string): Passage {
    const fixture = this.offlinePassages.get(usfm);
    if (!fixture) throw new Error(`No offline passage bundled for ${usfm}`);
    return {
      usfm: fixture.usfm,
      reference: fixture.reference,
      text: fixture.text,
      versionId: fixture.version_id,
      versionName: fixture.version_name,
      copyright: fixture.copyright,
      locale: locale || fixture.locale
    };
  }

  candidatesFor(event: Pick<WaitEvent, "taskType" | "timeWindow">): Profile[] {
    return this.profiles.filter((profile) => {
      if (!profile.task_types.includes(event.taskType)) return false;
      return !profile.time_windows || profile.time_windows.includes(event.timeWindow);
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

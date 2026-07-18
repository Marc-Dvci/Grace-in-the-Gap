import { ContentRepository } from "../content/repository.js";
import type { ScriptureProvider, ScriptureResult } from "../domain.js";

/**
 * Offline Scripture fallback. Serves a bundled public-domain (World English
 * Bible) verse only when the live YouVersion API is unreachable. It is never
 * the primary source and is always marked `live: false` in provenance so the
 * card and telemetry can label it as an offline fallback.
 */
export class OfflineScriptureProvider implements ScriptureProvider {
  constructor(private readonly content: ContentRepository) {}

  async getPassage(_versionId: string, usfm: string, locale: string): Promise<ScriptureResult> {
    return {
      passage: this.content.getOfflinePassage(usfm, locale),
      metadata: {
        provider: "web-offline-fallback",
        live: false,
        citations: ["bundled://public-domain/world-english-bible"]
      }
    };
  }
}

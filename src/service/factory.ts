import { loadConfig, type RuntimeConfig } from "../config.js";
import { ContentRepository } from "../content/repository.js";
import { GlooSelector } from "../providers/gloo.js";
import { OfflineScriptureProvider } from "../providers/offline.js";
import { YouVersionProvider } from "../providers/youversion.js";
import { MomentService } from "./moment-service.js";

export interface ServiceBundle {
  service: MomentService;
  content: ContentRepository;
  config: RuntimeConfig;
}

/**
 * Builds the live moment service. Grace requires Gloo and YouVersion
 * credentials: the Gloo AI Studio API selects an approved reflection/passage
 * and the YouVersion Platform API resolves the Scripture text and attribution.
 * The bundled public-domain provider is wired in only as an offline fallback
 * for a failed live YouVersion call. Constructing either provider without its
 * credentials throws a clear, actionable error.
 */
export function createService(config: RuntimeConfig = loadConfig()): ServiceBundle {
  const content = new ContentRepository();
  const selector = new GlooSelector(config.gloo);
  const scripture = new YouVersionProvider(config.youVersion);
  const offlineScripture = new OfflineScriptureProvider(content);

  return {
    config,
    content,
    service: new MomentService(
      content,
      selector,
      scripture,
      offlineScripture,
      config.preferences.bibleVersionId,
      config.preferences.telemetryEnabled
    )
  };
}

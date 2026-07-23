import { PreferencesSchema, type Preferences } from "./domain.js";

export type GlooEndpointMode = "tools" | "grounded";

export interface RuntimeConfig {
  preferences: Preferences;
  dataDirectory: string;
  gloo: {
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    model: string;
    endpointMode: GlooEndpointMode;
    ragPublisher: string;
    tradition: string;
  };
  youVersion: {
    appKey: string;
    baseUrl: string;
  };
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function integerValue(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hostTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const contextSetting = env.GRACE_CONTEXT_MODE || env.CLAUDE_PLUGIN_OPTION_CONTEXT_MODE;
  const contextMode = contextSetting === "private" ? "private" : "local-labels";
  const preferences = PreferencesSchema.parse({
    enabled: booleanValue(env.GRACE_ENABLED ?? env.CLAUDE_PLUGIN_OPTION_ENABLED, true),
    locale: env.GRACE_LOCALE || env.CLAUDE_PLUGIN_OPTION_LOCALE || "en-US",
    bibleVersionId: env.GRACE_BIBLE_VERSION_ID || "3034",
    timeZone: env.GRACE_TIME_ZONE || env.CLAUDE_PLUGIN_OPTION_TIME_ZONE || hostTimeZone(),
    tradition: env.GRACE_TRADITION || env.CLAUDE_PLUGIN_OPTION_TRADITION || "ecumenical",
    preferredTone:
      env.GRACE_PREFERRED_TONE || env.CLAUDE_PLUGIN_OPTION_PREFERRED_TONE || "balanced",
    showSelectionReason: booleanValue(
      env.GRACE_SHOW_SELECTION_REASON ?? env.CLAUDE_PLUGIN_OPTION_SHOW_SELECTION_REASON,
      true
    ),
    historyLimit: integerValue(
      env.GRACE_HISTORY_LIMIT ?? env.CLAUDE_PLUGIN_OPTION_HISTORY_LIMIT,
      12
    ),
    minimumWaitSeconds: integerValue(
      env.GRACE_MIN_WAIT_SECONDS ?? env.CLAUDE_PLUGIN_OPTION_MINIMUM_WAIT_SECONDS,
      8
    ),
    cooldownMinutes: integerValue(
      env.GRACE_COOLDOWN_MINUTES ?? env.CLAUDE_PLUGIN_OPTION_COOLDOWN_MINUTES,
      10
    ),
    maxCardsPerDay: integerValue(
      env.GRACE_MAX_CARDS_PER_DAY ?? env.CLAUDE_PLUGIN_OPTION_MAX_CARDS_PER_DAY,
      6
    ),
    contextMode,
    telemetryEnabled: booleanValue(
      env.GRACE_TELEMETRY_ENABLED ?? env.CLAUDE_PLUGIN_OPTION_TELEMETRY_ENABLED,
      false
    ),
    demoAlways: booleanValue(env.GRACE_DEMO_ALWAYS, false)
  });

  return {
    preferences,
    dataDirectory: env.GRACE_DATA_DIR || ".grace-data",
    gloo: {
      clientId: env.GLOO_CLIENT_ID || env.CLAUDE_PLUGIN_OPTION_GLOO_CLIENT_ID || "",
      clientSecret: env.GLOO_CLIENT_SECRET || env.CLAUDE_PLUGIN_OPTION_GLOO_CLIENT_SECRET || "",
      baseUrl: (env.GLOO_BASE_URL || "https://platform.ai.gloo.com").replace(/\/$/, ""),
      model: env.GLOO_MODEL || "gloo-openai-gpt-5-mini",
      endpointMode: (env.GLOO_ENDPOINT_MODE || env.CLAUDE_PLUGIN_OPTION_GLOO_ENDPOINT_MODE) === "grounded"
        ? "grounded"
        : "tools",
      ragPublisher: env.GLOO_RAG_PUBLISHER || env.CLAUDE_PLUGIN_OPTION_GLOO_RAG_PUBLISHER || "",
      tradition: env.GLOO_TRADITION || ""
    },
    youVersion: {
      appKey: env.YVP_APP_KEY || env.CLAUDE_PLUGIN_OPTION_YVP_APP_KEY || "",
      baseUrl: (env.YOUVERSION_BASE_URL || "https://api.youversion.com").replace(/\/$/, "")
    }
  };
}

export interface CredentialStatus {
  gloo: boolean;
  youVersion: boolean;
  complete: boolean;
}

/** Reports which required credentials are present, without revealing any secret. */
export function credentialStatus(config: RuntimeConfig): CredentialStatus {
  const gloo = Boolean(config.gloo.clientId && config.gloo.clientSecret);
  const youVersion = Boolean(config.youVersion.appKey);
  return { gloo, youVersion, complete: gloo && youVersion };
}

export const MISSING_CREDENTIALS_MESSAGE = [
  "Grace in the Gap needs live Gloo and YouVersion credentials.",
  "",
  "Set these environment variables (or fill a local .env file):",
  "  GLOO_CLIENT_ID, GLOO_CLIENT_SECRET   from https://studio.ai.gloo.com (API Credentials)",
  "  YVP_APP_KEY                          from https://developers.youversion.com (App Key)",
  "",
  "Both APIs are free for registered challenge participants. See README.md > Setup."
].join("\n");

/** Throws MISSING_CREDENTIALS_MESSAGE unless every required credential is set. */
export function assertCredentials(config: RuntimeConfig): void {
  if (!credentialStatus(config).complete) {
    throw new Error(MISSING_CREDENTIALS_MESSAGE);
  }
}

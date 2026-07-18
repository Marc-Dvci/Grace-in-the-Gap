import { z } from "zod";

export const TaskTypeSchema = z.enum([
  "generation",
  "implementation",
  "debugging",
  "testing",
  "analysis",
  "refactor",
  "planning",
  "review",
  "unknown"
]);

export const DurationBucketSchema = z.enum(["under-8", "8-15", "16-30", "over-30"]);
export const TimeWindowSchema = z.enum(["morning", "afternoon", "evening", "late-evening"]);
export const ToneSchema = z.enum(["calm", "steady", "encouraging", "reflective"]);

export const WaitEventSchema = z.object({
  surface: z.enum(["claude-code", "api", "mcp", "demo"]),
  taskType: TaskTypeSchema,
  estimatedWaitSeconds: z.number().int().min(0).max(600),
  durationBucket: DurationBucketSchema,
  locale: z.string().min(2).max(35),
  timeWindow: TimeWindowSchema,
  sessionHash: z.string().min(8).max(128),
  contextMode: z.enum(["private", "local-labels"])
}).strict();

export const SelectorDecisionSchema = z.object({
  momentProfileId: z.string().min(1),
  reflectionSnippetId: z.string().min(1),
  passageHint: z.string().regex(/^[1-3]?[A-Z]{2,3}\.[0-9]+\.[0-9]+(?:-[0-9]+)?$/),
  durationSeconds: z.number().int().min(3).max(20),
  tone: ToneSchema,
  confidence: z.number().min(0).max(1),
  fallbackVotd: z.boolean(),
  needsAuth: z.boolean()
}).strict();

export const ProfileSchema = z.object({
  id: z.string().min(1),
  task_types: z.array(TaskTypeSchema).min(1),
  tone: ToneSchema,
  snippet_id: z.string().min(1),
  passage_hint: z.string().min(1),
  time_windows: z.array(TimeWindowSchema).optional(),
  weight: z.number().positive()
});

export const SnippetSchema = z.object({
  id: z.string().min(1),
  locale: z.string().min(2),
  text: z.string().min(1).max(240),
  status: z.literal("approved-for-demo")
});

export const PassageSchema = z.object({
  usfm: z.string().min(1),
  reference: z.string().min(1),
  text: z.string().min(1).max(2000),
  versionId: z.string().min(1),
  versionName: z.string().min(1),
  copyright: z.string().min(1),
  locale: z.string().min(2)
}).strict();

export const CatalogSchema = z.object({
  release: z.string().min(1),
  review_notice: z.string().min(1),
  profiles: z.array(ProfileSchema).min(1),
  snippets: z.array(SnippetSchema).min(1),
  // Public-domain (World English Bible) verses bundled only as an offline
  // fallback for when the live YouVersion API is unreachable at runtime.
  offline_passages: z.array(
    z.object({
      usfm: z.string(),
      reference: z.string(),
      text: z.string(),
      version_id: z.string(),
      version_name: z.string(),
      copyright: z.string(),
      locale: z.string()
    })
  )
});

export const PreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  locale: z.string().min(2).max(35).default("en-US"),
  bibleVersionId: z.string().min(1).default("3034"),
  minimumWaitSeconds: z.number().int().min(0).max(120).default(8),
  cooldownMinutes: z.number().int().min(0).max(1440).default(10),
  maxCardsPerDay: z.number().int().min(0).max(100).default(6),
  contextMode: z.enum(["private", "local-labels"]).default("local-labels"),
  telemetryEnabled: z.boolean().default(false),
  demoAlways: z.boolean().default(false)
});

export const PolicyStateSchema = z.object({
  date: z.string(),
  shownToday: z.number().int().min(0),
  lastShownAt: z.string().datetime().nullable()
});

export const MomentExperienceSchema = z.object({
  traceId: z.string().uuid(),
  createdAt: z.string().datetime(),
  durationSeconds: z.number().int().min(3).max(20),
  tone: ToneSchema,
  reflection: z.string().min(1).max(240),
  passage: PassageSchema,
  provenance: z.object({
    selector: z.string().min(1),
    scripture: z.string().min(1),
    live: z.boolean(),
    degraded: z.boolean(),
    contentRelease: z.string().min(1),
    citations: z.array(z.string()).default([])
  }),
  privacy: z.object({
    rawPromptStored: z.literal(false),
    rawPromptTransmitted: z.literal(false),
    telemetryEnabled: z.boolean()
  })
});

export type TaskType = z.infer<typeof TaskTypeSchema>;
export type WaitEvent = z.infer<typeof WaitEventSchema>;
export type SelectorDecision = z.infer<typeof SelectorDecisionSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Snippet = z.infer<typeof SnippetSchema>;
export type Passage = z.infer<typeof PassageSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type PolicyState = z.infer<typeof PolicyStateSchema>;
export type MomentExperience = z.infer<typeof MomentExperienceSchema>;

export interface ProviderMetadata {
  provider: string;
  /** True when the value came from a live upstream API call (not an offline fallback). */
  live: boolean;
  citations: string[];
}

export interface SelectorResult {
  decision: SelectorDecision;
  metadata: ProviderMetadata;
}

export interface ScriptureResult {
  passage: Passage;
  metadata: ProviderMetadata;
}

export interface SelectorProvider {
  select(event: WaitEvent, candidates: readonly Profile[]): Promise<SelectorResult>;
}

export interface ScriptureProvider {
  getPassage(versionId: string, usfm: string, locale: string): Promise<ScriptureResult>;
}

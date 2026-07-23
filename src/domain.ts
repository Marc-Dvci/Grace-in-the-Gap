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
export const WorkflowStageSchema = z.enum([
  "starting",
  "retrying",
  "stuck",
  "recovering",
  "completed",
  "unknown"
]);
export const OutcomeSchema = z.enum(["failure", "partial", "success", "unknown"]);
export const RepeatBucketSchema = z.enum(["none", "one-two", "three-plus"]);
export const EffortBucketSchema = z.enum(["brief", "sustained", "long-session"]);
export const TraditionSchema = z.enum(["ecumenical", "catholic", "mainline", "evangelical"]);
export const LiturgicalSeasonSchema = z.enum([
  "advent",
  "christmas",
  "epiphany",
  "lent",
  "holy-week",
  "easter",
  "ordinary"
]);
export const ObservanceRankSchema = z.enum([
  "none",
  "commemoration",
  "festival",
  "principal"
]);

export const CalendarContextSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1).max(100),
  season: LiturgicalSeasonSchema,
  observanceIds: z.array(z.string().min(1).max(80)).max(8),
  observanceNames: z.array(z.string().min(1).max(160)).max(8),
  rank: ObservanceRankSchema,
  lectionaryRefs: z.array(z.string().min(1).max(30)).max(12)
}).strict();

export const WaitEventSchema = z.object({
  surface: z.enum(["claude-code", "api", "mcp", "demo"]),
  taskType: TaskTypeSchema,
  taskTypes: z.array(TaskTypeSchema).min(1).max(5),
  estimatedWaitSeconds: z.number().int().min(0).max(600),
  durationBucket: DurationBucketSchema,
  locale: z.string().min(2).max(35),
  timeWindow: TimeWindowSchema,
  workflowStage: WorkflowStageSchema,
  lastOutcome: OutcomeSchema,
  repeatBucket: RepeatBucketSchema,
  effortBucket: EffortBucketSchema,
  tradition: TraditionSchema,
  preferredTone: z.union([ToneSchema, z.literal("balanced")]),
  calendar: CalendarContextSchema,
  recentPassageIds: z.array(z.string().min(1).max(30)).max(30),
  recentSnippetIds: z.array(z.string().min(1).max(100)).max(30),
  recentProfileIds: z.array(z.string().min(1).max(100)).max(30),
  preferredProfileIds: z.array(z.string().min(1).max(100)).max(20).default([]),
  avoidedProfileIds: z.array(z.string().min(1).max(100)).max(20).default([]),
  avoidedPassageIds: z.array(z.string().min(1).max(30)).max(30).default([]),
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
  needsAuth: z.boolean(),
  reasonCodes: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).max(8)
}).strict();

export const ProfileSchema = z.object({
  id: z.string().min(1),
  task_types: z.array(TaskTypeSchema).min(1),
  themes: z.array(z.string().min(1).max(60)).min(1),
  tone: ToneSchema,
  snippet_ids: z.array(z.string().min(1)).min(1),
  passage_hints: z.array(z.string().min(1)).min(1),
  fallback_passage_hint: z.string().min(1),
  time_windows: z.array(TimeWindowSchema).optional(),
  workflow_stages: z.array(WorkflowStageSchema).optional(),
  liturgical_seasons: z.array(LiturgicalSeasonSchema).optional(),
  observance_ids: z.array(z.string().min(1).max(80)).optional(),
  requires_time_match: z.boolean().default(false),
  requires_workflow_match: z.boolean().default(false),
  requires_calendar_match: z.boolean().default(false),
  weight: z.number().positive()
});

export const SnippetSchema = z.object({
  id: z.string().min(1),
  locale: z.string().min(2),
  text: z.string().min(1).max(240),
  status: z.literal("approved-for-demo")
});

export const PassageHintSchema = z.object({
  usfm: z.string().regex(/^[1-3]?[A-Z]{2,3}\.[0-9]+(?:\.[0-9]+(?:-[0-9]+)?)?$/),
  reference: z.string().min(1).max(120),
  themes: z.array(z.string().min(1).max(60)).min(1),
  observance_ids: z.array(z.string().min(1).max(80)).optional(),
  review_status: z.literal("approved-for-demo")
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
  passage_hints: z.array(PassageHintSchema).min(1),
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
  timeZone: z.string().min(1).max(100).default("UTC"),
  tradition: TraditionSchema.default("ecumenical"),
  preferredTone: z.union([ToneSchema, z.literal("balanced")]).default("balanced"),
  showSelectionReason: z.boolean().default(true),
  historyLimit: z.number().int().min(3).max(30).default(12),
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

export const SessionStateSchema = z.object({
  sessionHash: z.string().min(8).max(128),
  updatedAt: z.string().datetime(),
  turnCount: z.number().int().min(0),
  repeatedTaskCount: z.number().int().min(0),
  lastTaskType: TaskTypeSchema.nullable(),
  recentPassageIds: z.array(z.string().min(1).max(30)).max(30),
  recentSnippetIds: z.array(z.string().min(1).max(100)).max(30),
  recentProfileIds: z.array(z.string().min(1).max(100)).max(30)
}).strict();

export const FeedbackStateSchema = z.object({
  moments: z.array(z.object({
    traceId: z.string().uuid(),
    createdAt: z.string().datetime(),
    profileId: z.string().min(1).max(100),
    passageId: z.string().min(1).max(30),
    snippetId: z.string().min(1).max(100),
    rating: z.number().int().min(1).max(5).optional()
  }).strict()).max(100)
}).strict();

export const MomentExperienceSchema = z.object({
  traceId: z.string().uuid(),
  createdAt: z.string().datetime(),
  durationSeconds: z.number().int().min(3).max(20),
  tone: ToneSchema,
  reflection: z.string().min(1).max(240),
  reflectionLocale: z.string().min(2).max(35),
  passage: PassageSchema,
  selection: z.object({
    profileId: z.string().min(1),
    snippetId: z.string().min(1),
    passageId: z.string().min(1),
    themes: z.array(z.string().min(1).max(60)).min(1),
    reasonCodes: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).max(8),
    explanationVisible: z.boolean()
  }).strict(),
  provenance: z.object({
    selector: z.string().min(1),
    scripture: z.string().min(1),
    selectorLive: z.boolean(),
    scriptureLive: z.boolean(),
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
export type CalendarContext = z.infer<typeof CalendarContextSchema>;
export type WaitEvent = z.infer<typeof WaitEventSchema>;
export type SelectorDecision = z.infer<typeof SelectorDecisionSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Snippet = z.infer<typeof SnippetSchema>;
export type PassageHint = z.infer<typeof PassageHintSchema>;
export type Passage = z.infer<typeof PassageSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type PolicyState = z.infer<typeof PolicyStateSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type FeedbackState = z.infer<typeof FeedbackStateSchema>;
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

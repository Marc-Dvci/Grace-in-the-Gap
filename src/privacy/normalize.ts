import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { resolveLiturgicalCalendar, timeWindowAt } from "../calendar/liturgical.js";
import {
  DurationBucketSchema,
  EffortBucketSchema,
  OutcomeSchema,
  RepeatBucketSchema,
  TaskTypeSchema,
  WaitEventSchema,
  WorkflowStageSchema,
  type Preferences,
  type SessionState,
  type TaskType,
  type WaitEvent
} from "../domain.js";

export const ClaudeHookInputSchema = z.object({
  session_id: z.string().min(1),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.literal("UserPromptSubmit"),
  prompt: z.string()
});

const TASK_PATTERNS: readonly [TaskType, RegExp][] = [
  ["debugging", /\b(debug|bug|fix|error|exception|failing|crash|broken|root cause|corriger|erreur|échec|plantage)\b/i],
  ["testing", /\b(test|tests|vitest|pytest|jest|coverage|benchmark|lint|typecheck|tester|tests?|couverture)\b/i],
  ["refactor", /\b(refactor|migrate|rewrite|modernize|clean up|optimi[sz]e|refactoriser|migrer|réécrire|optimiser)\b/i],
  ["review", /\b(review|audit|inspect|security|critique|check my|réviser|auditer|inspecter|sécurité)\b/i],
  ["planning", /\b(plan|design|architect|roadmap|strategy|specification|planifier|concevoir|architecture|stratégie)\b/i],
  ["implementation", /\b(build|implement|create|add|develop|code|ship|scaffold|construire|implémenter|créer|ajouter|développer)\b/i],
  ["analysis", /\b(analy[sz]e|explain|investigate|research|compare|understand|analyser|expliquer|rechercher|comparer|comprendre)\b/i],
  ["generation", /\b(write|generate|draft|produce|écrire|générer|rédiger|produire)\b/i]
];

export function classifyTaskTypes(prompt: string): TaskType[] {
  const matches: TaskType[] = [];
  for (const [taskType, pattern] of TASK_PATTERNS) {
    if (pattern.test(prompt)) matches.push(TaskTypeSchema.parse(taskType));
  }
  return matches.length > 0 ? matches.slice(0, 5) : ["unknown"];
}

function workflowStage(prompt: string): WaitEvent["workflowStage"] {
  if (/\b(done|completed|fixed|resolved|passing now|works now|terminé|corrigé|résolu|fonctionne maintenant)\b/i.test(prompt)) {
    return "completed";
  }
  if (/\b(recover|restore|roll back|regression|récupérer|restaurer|régression)\b/i.test(prompt)) {
    return "recovering";
  }
  if (/\b(stuck|blocked|cannot figure|can't figure|keeps failing|still failing|again and again|bloqué|n'arrive pas|échoue encore)\b/i.test(prompt)) {
    return "stuck";
  }
  if (/\b(retry|try again|rerun|again|second attempt|third attempt|réessayer|relancer|encore)\b/i.test(prompt)) {
    return "retrying";
  }
  if (/\b(start|begin|new project|from scratch|commencer|nouveau projet|de zéro)\b/i.test(prompt)) {
    return "starting";
  }
  return "unknown";
}

function outcome(prompt: string): WaitEvent["lastOutcome"] {
  if (/\b(passed|succeeded|fixed|resolved|working now|réussi|corrigé|résolu)\b/i.test(prompt)) {
    return "success";
  }
  if (/\b(partial|partly|some tests|incomplet|partiel|certains tests)\b/i.test(prompt)) {
    return "partial";
  }
  if (/\b(fail|failing|failed|error|crash|broken|échec|échoue|erreur|plantage|cassé)\b/i.test(prompt)) {
    return "failure";
  }
  return "unknown";
}

function estimateWaitSeconds(prompt: string, taskType: TaskType): number {
  if (prompt.trimStart().startsWith("/")) return 0;
  const baseByTask: Record<TaskType, number> = {
    generation: 8,
    implementation: 14,
    debugging: 12,
    testing: 10,
    analysis: 11,
    refactor: 16,
    planning: 9,
    review: 10,
    unknown: 4
  };
  const lengthCost = Math.min(16, Math.floor(prompt.length / 180) * 3);
  const scopeCost = /\b(entire|all files|repository|codebase|end[- ]to[- ]end|comprehensive)\b/i.test(prompt)
    ? 8
    : 0;
  return Math.min(120, baseByTask[taskType] + lengthCost + scopeCost);
}

function durationBucket(seconds: number): WaitEvent["durationBucket"] {
  if (seconds < 8) return "under-8";
  if (seconds <= 15) return "8-15";
  if (seconds <= 30) return "16-30";
  return "over-30";
}

function effortBucket(
  waitSeconds: number,
  sessionState: SessionState | undefined
): WaitEvent["effortBucket"] {
  if (waitSeconds >= 30 || (sessionState?.turnCount ?? 0) >= 8) return "long-session";
  if (waitSeconds >= 12 || (sessionState?.turnCount ?? 0) >= 3) return "sustained";
  return "brief";
}

function repeatBucket(
  explicitStage: WaitEvent["workflowStage"],
  sessionState: SessionState | undefined,
  primaryTask: TaskType
): WaitEvent["repeatBucket"] {
  const repeated = sessionState?.lastTaskType === primaryTask
    ? sessionState.repeatedTaskCount + 1
    : 0;
  if (explicitStage === "stuck" || repeated >= 3) return "three-plus";
  if (explicitStage === "retrying" || repeated >= 1) return "one-two";
  return "none";
}

export function hashSessionId(sessionId: string, salt?: string): string {
  if (salt) {
    return createHmac("sha256", salt).update(sessionId).digest("hex").slice(0, 24);
  }
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
}

export function normalizeClaudeHook(
  input: unknown,
  options: {
    locale: string;
    timeZone: string;
    tradition: Preferences["tradition"];
    preferredTone: Preferences["preferredTone"];
    contextMode: "private" | "local-labels";
    sessionState?: SessionState;
    feedback?: {
      preferredProfileIds: string[];
      avoidedProfileIds: string[];
      avoidedPassageIds: string[];
    };
    sessionSalt?: string;
    now?: Date;
  }
): WaitEvent {
  const hook = ClaudeHookInputSchema.parse(input);
  const taskTypes = options.contextMode === "private" ? ["unknown" as const] : classifyTaskTypes(hook.prompt);
  const taskType = taskTypes[0] ?? "unknown";
  const estimatedWaitSeconds = estimateWaitSeconds(hook.prompt, taskType);
  const now = options.now ?? new Date();
  const stage = options.contextMode === "private" ? "unknown" : workflowStage(hook.prompt);
  const lastOutcome = options.contextMode === "private" ? "unknown" : outcome(hook.prompt);
  const calendar = resolveLiturgicalCalendar({
    now,
    timeZone: options.timeZone,
    tradition: options.tradition
  });
  const event = {
    surface: "claude-code" as const,
    taskType,
    taskTypes,
    estimatedWaitSeconds,
    durationBucket: DurationBucketSchema.parse(durationBucket(estimatedWaitSeconds)),
    locale: options.locale,
    timeWindow: timeWindowAt(now, options.timeZone),
    workflowStage: WorkflowStageSchema.parse(stage),
    lastOutcome: OutcomeSchema.parse(lastOutcome),
    repeatBucket: RepeatBucketSchema.parse(repeatBucket(stage, options.sessionState, taskType)),
    effortBucket: EffortBucketSchema.parse(effortBucket(estimatedWaitSeconds, options.sessionState)),
    tradition: options.tradition,
    preferredTone: options.preferredTone,
    calendar,
    recentPassageIds: options.sessionState?.recentPassageIds ?? [],
    recentSnippetIds: options.sessionState?.recentSnippetIds ?? [],
    recentProfileIds: options.sessionState?.recentProfileIds ?? [],
    preferredProfileIds: options.feedback?.preferredProfileIds ?? [],
    avoidedProfileIds: options.feedback?.avoidedProfileIds ?? [],
    avoidedPassageIds: options.feedback?.avoidedPassageIds ?? [],
    sessionHash: hashSessionId(hook.session_id, options.sessionSalt),
    contextMode: options.contextMode
  };
  return WaitEventSchema.parse(event);
}

export function buildManualEvent(options: {
  taskType?: TaskType;
  locale: string;
  sessionSeed: string;
  timeZone?: string;
  tradition?: Preferences["tradition"];
  preferredTone?: Preferences["preferredTone"];
  workflowStage?: WaitEvent["workflowStage"];
  lastOutcome?: WaitEvent["lastOutcome"];
  repeatBucket?: WaitEvent["repeatBucket"];
  recentPassageIds?: string[];
  recentSnippetIds?: string[];
  recentProfileIds?: string[];
  preferredProfileIds?: string[];
  avoidedProfileIds?: string[];
  avoidedPassageIds?: string[];
  now?: Date;
  surface?: "mcp" | "api" | "demo";
}): WaitEvent {
  const estimatedWaitSeconds = 12;
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? "UTC";
  const tradition = options.tradition ?? "ecumenical";
  const taskType = options.taskType ?? "unknown";
  return WaitEventSchema.parse({
    surface: options.surface ?? "mcp",
    taskType,
    taskTypes: [taskType],
    estimatedWaitSeconds,
    durationBucket: "8-15",
    locale: options.locale,
    timeWindow: timeWindowAt(now, timeZone),
    workflowStage: options.workflowStage ?? "unknown",
    lastOutcome: options.lastOutcome ?? "unknown",
    repeatBucket: options.repeatBucket ?? "none",
    effortBucket: "sustained",
    tradition,
    preferredTone: options.preferredTone ?? "balanced",
    calendar: resolveLiturgicalCalendar({ now, timeZone, tradition }),
    recentPassageIds: options.recentPassageIds ?? [],
    recentSnippetIds: options.recentSnippetIds ?? [],
    recentProfileIds: options.recentProfileIds ?? [],
    preferredProfileIds: options.preferredProfileIds ?? [],
    avoidedProfileIds: options.avoidedProfileIds ?? [],
    avoidedPassageIds: options.avoidedPassageIds ?? [],
    sessionHash: createHash("sha256").update(options.sessionSeed).digest("hex").slice(0, 24),
    contextMode: "private"
  });
}

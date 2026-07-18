import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DurationBucketSchema,
  TaskTypeSchema,
  TimeWindowSchema,
  WaitEventSchema,
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
  ["debugging", /\b(debug|bug|fix|error|exception|failing|crash|broken|root cause)\b/i],
  ["testing", /\b(test|tests|vitest|pytest|jest|coverage|benchmark|lint|typecheck)\b/i],
  ["refactor", /\b(refactor|migrate|rewrite|modernize|clean up|optimi[sz]e)\b/i],
  ["review", /\b(review|audit|inspect|security|critique|check my)\b/i],
  ["planning", /\b(plan|design|architect|roadmap|strategy|specification)\b/i],
  ["implementation", /\b(build|implement|create|add|develop|code|ship|scaffold)\b/i],
  ["analysis", /\b(analy[sz]e|explain|investigate|research|compare|understand)\b/i],
  ["generation", /\b(write|generate|draft|produce)\b/i]
];

function classifyTask(prompt: string): TaskType {
  for (const [taskType, pattern] of TASK_PATTERNS) {
    if (pattern.test(prompt)) return TaskTypeSchema.parse(taskType);
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

function timeWindow(date: Date): WaitEvent["timeWindow"] {
  const hour = date.getHours();
  if (hour < 5 || hour >= 22) return "late-evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function normalizeClaudeHook(
  input: unknown,
  options: { locale: string; contextMode: "private" | "local-labels"; now?: Date }
): WaitEvent {
  const hook = ClaudeHookInputSchema.parse(input);
  const taskType = options.contextMode === "private" ? "unknown" : classifyTask(hook.prompt);
  const estimatedWaitSeconds = estimateWaitSeconds(hook.prompt, taskType);
  const event = {
    surface: "claude-code" as const,
    taskType,
    estimatedWaitSeconds,
    durationBucket: DurationBucketSchema.parse(durationBucket(estimatedWaitSeconds)),
    locale: options.locale,
    timeWindow: TimeWindowSchema.parse(timeWindow(options.now ?? new Date())),
    sessionHash: createHash("sha256").update(hook.session_id).digest("hex").slice(0, 24),
    contextMode: options.contextMode
  };
  return WaitEventSchema.parse(event);
}

export function buildManualEvent(options: {
  taskType?: TaskType;
  locale: string;
  sessionSeed: string;
  now?: Date;
  surface?: "mcp" | "api" | "demo";
}): WaitEvent {
  const estimatedWaitSeconds = 12;
  return WaitEventSchema.parse({
    surface: options.surface ?? "mcp",
    taskType: options.taskType ?? "unknown",
    estimatedWaitSeconds,
    durationBucket: "8-15",
    locale: options.locale,
    timeWindow: timeWindow(options.now ?? new Date()),
    sessionHash: createHash("sha256").update(options.sessionSeed).digest("hex").slice(0, 24),
    contextMode: "private"
  });
}

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { localDateAt } from "../calendar/liturgical.js";
import {
  FeedbackStateSchema,
  PolicyStateSchema,
  PreferencesSchema,
  SessionStateSchema,
  type MomentExperience,
  type PolicyState,
  type Preferences,
  type SessionState,
  type TaskType
} from "../domain.js";

const SessionFileSchema = z.object({
  sessions: z.array(SessionStateSchema).max(50)
}).strict();

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

export class GraceDataStore {
  private readonly preferencesPath: string;
  private readonly policyPath: string;
  private readonly sessionsPath: string;
  private readonly installationSaltPath: string;
  private readonly feedbackPath: string;
  readonly telemetryPath: string;

  constructor(readonly directory: string) {
    this.preferencesPath = join(directory, "preferences.json");
    this.policyPath = join(directory, "policy-state.json");
    this.sessionsPath = join(directory, "session-state.json");
    this.installationSaltPath = join(directory, "installation-salt");
    this.feedbackPath = join(directory, "feedback-state.json");
    this.telemetryPath = join(directory, "telemetry.jsonl");
  }

  async loadPreferences(defaults: Preferences): Promise<Preferences> {
    const stored = await readJson(this.preferencesPath);
    if (!stored || typeof stored !== "object") return defaults;
    return PreferencesSchema.parse({ ...defaults, ...stored });
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    await writeJsonAtomically(this.preferencesPath, PreferencesSchema.parse(preferences));
  }

  async loadPolicyState(now: Date, timeZone = "UTC"): Promise<PolicyState> {
    const today = localDateAt(now, timeZone);
    const stored = PolicyStateSchema.safeParse(await readJson(this.policyPath));
    if (!stored.success || stored.data.date !== today) {
      return { date: today, shownToday: 0, lastShownAt: null };
    }
    return stored.data;
  }

  async savePolicyState(state: PolicyState): Promise<void> {
    await writeJsonAtomically(this.policyPath, PolicyStateSchema.parse(state));
  }

  async installationSalt(): Promise<string> {
    try {
      const existing = (await readFile(this.installationSaltPath, "utf8")).trim();
      if (existing.length >= 32) return existing;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") throw error;
    }

    await mkdir(dirname(this.installationSaltPath), { recursive: true });
    const generated = randomBytes(32).toString("hex");
    try {
      await writeFile(this.installationSaltPath, generated, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx"
      });
      return generated;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "EEXIST") throw error;
      return (await readFile(this.installationSaltPath, "utf8")).trim();
    }
  }

  async loadSessionState(sessionHash: string, now: Date): Promise<SessionState> {
    const parsed = SessionFileSchema.safeParse(await readJson(this.sessionsPath));
    const existing = parsed.success
      ? parsed.data.sessions.find((session) => session.sessionHash === sessionHash)
      : undefined;
    return existing ?? {
      sessionHash,
      updatedAt: now.toISOString(),
      turnCount: 0,
      repeatedTaskCount: 0,
      lastTaskType: null,
      recentPassageIds: [],
      recentSnippetIds: [],
      recentProfileIds: []
    };
  }

  async recordSessionTurn(options: {
    previous: SessionState;
    taskType: TaskType;
    now: Date;
  }): Promise<SessionState> {
    const parsed = SessionFileSchema.safeParse(await readJson(this.sessionsPath));
    const sessions = parsed.success ? [...parsed.data.sessions] : [];
    const next = SessionStateSchema.parse({
      ...options.previous,
      updatedAt: options.now.toISOString(),
      turnCount: options.previous.turnCount + 1,
      repeatedTaskCount:
        options.previous.lastTaskType === options.taskType
          ? options.previous.repeatedTaskCount + 1
          : 0,
      lastTaskType: options.taskType
    });
    const retained = sessions
      .filter((session) => session.sessionHash !== next.sessionHash)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 19);
    await writeJsonAtomically(this.sessionsPath, { sessions: [next, ...retained] });
    return next;
  }

  async recordSessionMoment(options: {
    previous: SessionState;
    taskType: TaskType;
    moment: MomentExperience;
    historyLimit: number;
    now: Date;
  }): Promise<SessionState> {
    const parsed = SessionFileSchema.safeParse(await readJson(this.sessionsPath));
    const sessions = parsed.success ? [...parsed.data.sessions] : [];
    const limit = options.historyLimit;
    const prependUnique = (value: string, values: readonly string[]) => {
      return [value, ...values.filter((item) => item !== value)].slice(0, limit);
    };
    const next = SessionStateSchema.parse({
      sessionHash: options.previous.sessionHash,
      updatedAt: options.now.toISOString(),
      turnCount: options.previous.turnCount + 1,
      repeatedTaskCount:
        options.previous.lastTaskType === options.taskType
          ? options.previous.repeatedTaskCount + 1
          : 0,
      lastTaskType: options.taskType,
      recentPassageIds: prependUnique(
        options.moment.selection.passageId,
        options.previous.recentPassageIds
      ),
      recentSnippetIds: prependUnique(
        options.moment.selection.snippetId,
        options.previous.recentSnippetIds
      ),
      recentProfileIds: prependUnique(
        options.moment.selection.profileId,
        options.previous.recentProfileIds
      )
    });
    const retained = sessions
      .filter((session) => session.sessionHash !== next.sessionHash)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 19);
    await writeJsonAtomically(this.sessionsPath, { sessions: [next, ...retained] });
    return next;
  }

  async recordPresentedMoment(moment: MomentExperience): Promise<void> {
    const parsed = FeedbackStateSchema.safeParse(await readJson(this.feedbackPath));
    const moments = parsed.success ? parsed.data.moments : [];
    const existing = moments.find((item) => item.traceId === moment.traceId);
    const current = {
      traceId: moment.traceId,
      createdAt: moment.createdAt,
      profileId: moment.selection.profileId,
      passageId: moment.selection.passageId,
      snippetId: moment.selection.snippetId,
      ...(existing?.rating ? { rating: existing.rating } : {})
    };
    await writeJsonAtomically(this.feedbackPath, {
      moments: [
        current,
        ...moments.filter((item) => item.traceId !== moment.traceId)
      ].slice(0, 100)
    });
  }

  async recordFeedback(momentId: string, rating: number): Promise<{
    traceId: string;
    profileId: string;
    passageId: string;
    rating: number;
  }> {
    if (!/^[0-9a-f-]{8,36}$/i.test(momentId)) {
      throw new Error("Moment ID must be the 8-character card ID or a full trace ID");
    }
    const parsed = FeedbackStateSchema.safeParse(await readJson(this.feedbackPath));
    if (!parsed.success) throw new Error("No locally recorded Grace moments are available");
    const matches = parsed.data.moments.filter((item) => {
      return item.traceId === momentId || item.traceId.startsWith(momentId);
    });
    if (matches.length !== 1) {
      throw new Error(matches.length === 0 ? "Moment ID was not found locally" : "Moment ID is ambiguous");
    }
    const matched = matches[0]!;
    const safeRating = z.number().int().min(1).max(5).parse(rating);
    const moments = parsed.data.moments.map((item) => {
      return item.traceId === matched.traceId ? { ...item, rating: safeRating } : item;
    });
    await writeJsonAtomically(this.feedbackPath, { moments });
    return {
      traceId: matched.traceId,
      profileId: matched.profileId,
      passageId: matched.passageId,
      rating: safeRating
    };
  }

  async loadFeedbackContext(): Promise<{
    preferredProfileIds: string[];
    avoidedProfileIds: string[];
    avoidedPassageIds: string[];
  }> {
    const parsed = FeedbackStateSchema.safeParse(await readJson(this.feedbackPath));
    if (!parsed.success) {
      return { preferredProfileIds: [], avoidedProfileIds: [], avoidedPassageIds: [] };
    }
    const averages = (key: "profileId" | "passageId") => {
      const values = new Map<string, number[]>();
      for (const moment of parsed.data.moments) {
        if (!moment.rating) continue;
        const ratings = values.get(moment[key]) ?? [];
        ratings.push(moment.rating);
        values.set(moment[key], ratings);
      }
      return [...values.entries()].map(([id, ratings]) => ({
        id,
        average: ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      }));
    };
    const profiles = averages("profileId");
    const passages = averages("passageId");
    return {
      preferredProfileIds: profiles
        .filter((item) => item.average >= 4)
        .map((item) => item.id)
        .slice(0, 20),
      avoidedProfileIds: profiles
        .filter((item) => item.average <= 2)
        .map((item) => item.id)
        .slice(0, 20),
      avoidedPassageIds: passages
        .filter((item) => item.average <= 2)
        .map((item) => item.id)
        .slice(0, 30)
    };
  }
}

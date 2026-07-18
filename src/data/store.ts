import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  PolicyStateSchema,
  PreferencesSchema,
  type PolicyState,
  type Preferences
} from "../domain.js";

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
  readonly telemetryPath: string;

  constructor(readonly directory: string) {
    this.preferencesPath = join(directory, "preferences.json");
    this.policyPath = join(directory, "policy-state.json");
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

  async loadPolicyState(now: Date): Promise<PolicyState> {
    const today = now.toISOString().slice(0, 10);
    const stored = PolicyStateSchema.safeParse(await readJson(this.policyPath));
    if (!stored.success || stored.data.date !== today) {
      return { date: today, shownToday: 0, lastShownAt: null };
    }
    return stored.data;
  }

  async savePolicyState(state: PolicyState): Promise<void> {
    await writeJsonAtomically(this.policyPath, PolicyStateSchema.parse(state));
  }
}

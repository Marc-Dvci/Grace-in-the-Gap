import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ContentRepository } from "../content/repository.js";
import type { MomentExperience } from "../domain.js";
import { providerLabel } from "../render.js";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export function buildSpinnerPatch(content = new ContentRepository()): JsonObject {
  const tips = [...new Set(content.profiles.map((profile) => {
    const snippetId = profile.snippet_ids[0];
    const passageHint = profile.fallback_passage_hint;
    if (!snippetId) throw new Error(`Profile ${profile.id} has no snippet`);
    const snippet = content.getSnippet(snippetId, "en-US");
    return `Grace · ${snippet.text} — ${content.referenceFor(passageHint)}`;
  }))];
  return {
    spinnerTipsEnabled: true,
    spinnerTipsOverride: {
      excludeDefault: true,
      tips
    },
    spinnerVerbs: {
      mode: "append",
      verbs: ["Pausing", "Breathing", "Reflecting"]
    }
  };
}

export function buildMomentSpinnerPatch(moment: MomentExperience): JsonObject {
  return {
    spinnerTipsEnabled: true,
    spinnerTipsOverride: {
      excludeDefault: true,
      tips: [
        `Grace · ${moment.reflection} — ${moment.passage.reference} · ${moment.passage.versionName} · ${moment.passage.copyright} · ${providerLabel(moment)}`
      ]
    },
    spinnerVerbs: {
      mode: "append",
      verbs: ["Pausing", "Breathing", "Reflecting"]
    }
  };
}

export function mergeSpinnerSettings(existing: JsonObject, patch = buildSpinnerPatch()): JsonObject {
  const currentOverride = objectValue(existing.spinnerTipsOverride);
  const patchOverride = objectValue(patch.spinnerTipsOverride);
  const currentTips = Array.isArray(currentOverride.tips)
    ? currentOverride.tips.filter((tip): tip is string => typeof tip === "string")
    : [];
  const patchTips = Array.isArray(patchOverride.tips)
    ? patchOverride.tips.filter((tip): tip is string => typeof tip === "string")
    : [];
  const currentVerbs = objectValue(existing.spinnerVerbs);
  const patchVerbs = objectValue(patch.spinnerVerbs);
  const verbs = [
    ...(Array.isArray(currentVerbs.verbs) ? currentVerbs.verbs : []),
    ...(Array.isArray(patchVerbs.verbs) ? patchVerbs.verbs : [])
  ].filter((verb): verb is string => typeof verb === "string");

  return {
    ...existing,
    spinnerTipsEnabled: true,
    spinnerTipsOverride: {
      ...currentOverride,
      excludeDefault: true,
      tips: [...new Set([...currentTips, ...patchTips])]
    },
    spinnerVerbs: {
      ...currentVerbs,
      mode: "append",
      verbs: [...new Set(verbs)]
    }
  };
}

export async function installSpinnerSettings(
  settingsPath: string,
  patch: JsonObject = buildSpinnerPatch()
): Promise<{ backupPath?: string }> {
  let existing: JsonObject = {};
  let backupPath: string | undefined;
  try {
    existing = objectValue(JSON.parse(await readFile(settingsPath, "utf8")) as unknown);
    backupPath = `${settingsPath}.grace-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await copyFile(settingsPath, backupPath);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  }

  const merged = mergeSpinnerSettings(existing, patch);
  await mkdir(dirname(settingsPath), { recursive: true });
  const temporary = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, settingsPath);
  return backupPath ? { backupPath } : {};
}

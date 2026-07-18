import { z } from "zod";
import { PassageSchema, type ScriptureProvider, type ScriptureResult } from "../domain.js";
import { fetchWithTimeout, parseJsonResponse, type FetchLike } from "./http.js";

interface YouVersionOptions {
  appKey: string;
  baseUrl: string;
  fetchImplementation?: FetchLike;
  timeoutMs?: number;
}

const GenericObjectSchema = z.record(z.string(), z.unknown());

function asRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = GenericObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function firstString(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

/** Publisher copyright strings are sometimes returned wrapped in literal quotes. */
function unwrapQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

interface BibleMetadata {
  versionId: string;
  versionName: string;
  copyright: string;
}

/**
 * Live YouVersion Platform REST adapter.
 *
 * The passage endpoint (`/v1/bibles/{id}/passages/{usfm}`) returns only the
 * verse text and reference. Copyright and version metadata come from the
 * separate Bible resource (`/v1/bibles/{id}`), which is fetched in parallel and
 * cached per version. A passage is never surfaced without its required
 * copyright attribution.
 */
export class YouVersionProvider implements ScriptureProvider {
  private readonly fetchImplementation: FetchLike;
  private readonly timeoutMs: number;
  private readonly metadataCache = new Map<string, BibleMetadata>();

  constructor(private readonly options: YouVersionOptions) {
    if (!options.appKey) throw new Error("YVP_APP_KEY is required");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 6_000;
  }

  async getPassage(versionId: string, usfm: string, locale: string): Promise<ScriptureResult> {
    const passageUrl = new URL(
      `/v1/bibles/${encodeURIComponent(versionId)}/passages/${encodeURIComponent(usfm)}`,
      `${this.options.baseUrl}/`
    );
    passageUrl.searchParams.set("format", "text");

    const [passageBody, metadata] = await Promise.all([
      this.get(passageUrl, locale, "YouVersion passage"),
      this.getBibleMetadata(versionId, locale)
    ]);

    // The passage payload is a flat object; tolerate an optional `data` wrapper.
    const passageRecord = asRecord(passageBody);
    const data = asRecord(passageRecord?.data) ?? passageRecord;
    const text = firstString(data, ["content", "text", "passage_text"]);
    if (!text) throw new Error("YouVersion passage response did not include text");

    const passage = PassageSchema.parse({
      usfm,
      reference: firstString(data, ["reference", "human_reference", "display_reference"]) ?? usfm,
      text,
      versionId: metadata.versionId,
      versionName: metadata.versionName,
      copyright: metadata.copyright,
      locale
    });
    return {
      passage,
      metadata: {
        provider: "youversion-rest",
        live: true,
        citations: [passageUrl.toString()]
      }
    };
  }

  private async getBibleMetadata(versionId: string, locale: string): Promise<BibleMetadata> {
    const cached = this.metadataCache.get(versionId);
    if (cached) return cached;

    const url = new URL(`/v1/bibles/${encodeURIComponent(versionId)}`, `${this.options.baseUrl}/`);
    const body = await this.get(url, locale, "YouVersion bible metadata");
    const record = asRecord(asRecord(body)?.data) ?? asRecord(body);
    const copyright = firstString(record, ["copyright", "promotional_content"]);
    if (!copyright) {
      throw new Error("YouVersion bible metadata did not include required copyright attribution");
    }

    const metadata: BibleMetadata = {
      versionId: firstString(record, ["id"]) ?? versionId,
      versionName:
        firstString(record, ["abbreviation", "localized_abbreviation", "title", "localized_title"]) ??
        `Bible ${versionId}`,
      copyright: unwrapQuotes(copyright)
    };
    this.metadataCache.set(versionId, metadata);
    return metadata;
  }

  private async get(url: URL, locale: string, label: string): Promise<unknown> {
    const response = await fetchWithTimeout(
      this.fetchImplementation,
      url,
      {
        method: "GET",
        headers: {
          "X-YVP-App-Key": this.options.appKey,
          "Accept-Language": locale,
          Accept: "application/json"
        }
      },
      this.timeoutMs
    );
    return parseJsonResponse(response, label);
  }
}

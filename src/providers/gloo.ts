import { z } from "zod";
import {
  SelectorDecisionSchema,
  type Profile,
  type SelectorProvider,
  type SelectorResult,
  type WaitEvent
} from "../domain.js";
import { fetchWithTimeout, parseJsonResponse, type FetchLike } from "./http.js";

interface GlooOptions {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  model: string;
  endpointMode: "responses" | "grounded";
  ragPublisher: string;
  tradition: string;
  fetchImplementation?: FetchLike;
  timeoutMs?: number;
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().default(3600),
  token_type: z.string().default("Bearer")
});

const GenericObjectSchema = z.record(z.string(), z.unknown());

export class GlooSelector implements SelectorProvider {
  private accessToken: { value: string; expiresAt: number } | undefined;
  private readonly fetchImplementation: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: GlooOptions) {
    if (!options.clientId || !options.clientSecret) {
      throw new Error("GLOO_CLIENT_ID and GLOO_CLIENT_SECRET are required");
    }
    if (options.endpointMode === "grounded" && !options.ragPublisher) {
      throw new Error("GLOO_RAG_PUBLISHER is required for grounded endpoint mode");
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async select(event: WaitEvent, candidates: readonly Profile[]): Promise<SelectorResult> {
    const token = await this.getAccessToken();
    const instructions = this.buildInstructions(candidates);
    const safeInput = JSON.stringify({
      surface: event.surface,
      taskType: event.taskType,
      durationBucket: event.durationBucket,
      locale: event.locale,
      timeWindow: event.timeWindow,
      contextMode: event.contextMode
    });

    const request = this.options.endpointMode === "grounded"
      ? {
          url: `${this.options.baseUrl}/ai/v2/chat/completions/grounded`,
          body: {
            messages: [
              { role: "system", content: instructions },
              { role: "user", content: safeInput }
            ],
            auto_routing: true,
            rag_publisher: this.options.ragPublisher,
            sources_limit: 3,
            ...(this.options.tradition ? { tradition: this.options.tradition } : {})
          }
        }
      : {
          url: `${this.options.baseUrl}/ai/v1/responses`,
          body: {
            model: this.options.model,
            instructions,
            input: [{ role: "user", content: safeInput }]
          }
        };

    const response = await fetchWithTimeout(this.fetchImplementation, request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request.body)
    }, this.timeoutMs);
    const body = await parseJsonResponse(response, "Gloo");
    const decision = SelectorDecisionSchema.parse(JSON.parse(this.extractText(body)) as unknown);
    return {
      decision,
      metadata: {
        provider: `gloo-${this.options.endpointMode}`,
        live: true,
        citations: this.extractCitations(body)
      }
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString("base64");
    const response = await fetchWithTimeout(
      this.fetchImplementation,
      `${this.options.baseUrl}/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: "api/access" })
      },
      this.timeoutMs
    );
    const token = TokenResponseSchema.parse(await parseJsonResponse(response, "Gloo auth"));
    this.accessToken = {
      value: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000
    };
    return token.access_token;
  }

  private buildInstructions(candidates: readonly Profile[]): string {
    const allowed = candidates.map((profile) => ({
      momentProfileId: profile.id,
      reflectionSnippetId: profile.snippet_id,
      passageHint: profile.passage_hint,
      tone: profile.tone
    }));
    return [
      "You are a structured selector for Grace in the Gap.",
      "Return one valid JSON object only: no Markdown and no user-facing prose.",
      "Choose one allowed candidate without changing any candidate field.",
      "Use durationSeconds 5 or 8, confidence from 0 to 1, fallbackVotd false, and needsAuth false.",
      `Allowed candidates: ${JSON.stringify(allowed)}`,
      "Required camelCase keys: momentProfileId, reflectionSnippetId, passageHint, durationSeconds, tone, confidence, fallbackVotd, needsAuth."
    ].join("\n");
  }

  private extractText(body: unknown): string {
    const record = GenericObjectSchema.parse(body);
    const choices = record.choices;
    if (Array.isArray(choices)) {
      const first = GenericObjectSchema.safeParse(choices[0]);
      const message = first.success ? GenericObjectSchema.safeParse(first.data.message) : undefined;
      if (message?.success && typeof message.data.content === "string") return message.data.content.trim();
    }
    const output = record.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        const parsedItem = GenericObjectSchema.safeParse(item);
        if (!parsedItem.success || parsedItem.data.type !== "message") continue;
        const content = parsedItem.data.content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
          const parsedPart = GenericObjectSchema.safeParse(part);
          if (parsedPart.success && typeof parsedPart.data.text === "string") {
            return parsedPart.data.text.trim();
          }
        }
      }
    }
    throw new Error("Gloo response did not contain assistant JSON text");
  }

  private extractCitations(body: unknown): string[] {
    const record = GenericObjectSchema.safeParse(body);
    if (!record.success || !Array.isArray(record.data.citations)) return [];
    return record.data.citations
      .map((citation) => {
        if (typeof citation === "string") return citation;
        const parsed = GenericObjectSchema.safeParse(citation);
        if (!parsed.success) return undefined;
        const value = parsed.data.url ?? parsed.data.source ?? parsed.data.id;
        return typeof value === "string" ? value : undefined;
      })
      .filter((value): value is string => Boolean(value));
  }
}

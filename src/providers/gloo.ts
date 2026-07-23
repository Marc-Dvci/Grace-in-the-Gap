import { z } from "zod";
import {
  SelectorDecisionSchema,
  type Profile,
  type SelectorProvider,
  type SelectorResult,
  type WaitEvent
} from "../domain.js";
import { fetchJsonWithRetry, type FetchLike } from "./http.js";

interface GlooOptions {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  model: string;
  endpointMode: "tools" | "grounded";
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
    // Tool-capable completions can exceed a chat-sized 10s budget on a cold
    // route. The hook is asynchronous, so a 30s provider budget preserves
    // reliability without delaying Claude's work.
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async select(event: WaitEvent, candidates: readonly Profile[]): Promise<SelectorResult> {
    const token = await this.getAccessToken();
    const instructions = this.buildInstructions(candidates);
    const tool = this.buildSelectionTool(candidates);
    const safeInput = JSON.stringify({
      surface: event.surface,
      taskType: event.taskType,
      taskTypes: event.taskTypes,
      durationBucket: event.durationBucket,
      locale: event.locale,
      timeWindow: event.timeWindow,
      workflowStage: event.workflowStage,
      lastOutcome: event.lastOutcome,
      repeatBucket: event.repeatBucket,
      effortBucket: event.effortBucket,
      tradition: event.tradition,
      preferredTone: event.preferredTone,
      calendar: event.calendar,
      recentPassageIds: event.recentPassageIds,
      recentSnippetIds: event.recentSnippetIds,
      recentProfileIds: event.recentProfileIds,
      preferredProfileIds: event.preferredProfileIds,
      avoidedProfileIds: event.avoidedProfileIds,
      avoidedPassageIds: event.avoidedPassageIds,
      contextMode: event.contextMode
    });
    const tradition = this.options.tradition ||
      (event.tradition === "ecumenical" ? "" : event.tradition);

    const sharedBody = {
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: safeInput }
      ],
      tools: [tool],
      tool_choice: "required",
      temperature: 0,
      ...(tradition ? { tradition } : {})
    };
    const request = this.options.endpointMode === "grounded"
      ? {
          url: `${this.options.baseUrl}/ai/v2/chat/completions/grounded`,
          body: {
            ...sharedBody,
            auto_routing: true,
            rag_publisher: this.options.ragPublisher,
            sources_limit: 5,
            include_citations: true
          }
        }
      : {
          url: `${this.options.baseUrl}/ai/v2/chat/completions`,
          body: {
            ...sharedBody,
            model: this.options.model,
            max_tokens: 300
          }
        };

    const body = await fetchJsonWithRetry(
      this.fetchImplementation,
      request.url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request.body)
      },
      this.timeoutMs,
      "Gloo"
    );
    const decision = SelectorDecisionSchema.parse(
      JSON.parse(this.extractDecisionPayload(body)) as unknown
    );
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
    const body = await fetchJsonWithRetry(
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
      this.timeoutMs,
      "Gloo auth"
    );
    const token = TokenResponseSchema.parse(body);
    this.accessToken = {
      value: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000
    };
    return token.access_token;
  }

  private buildInstructions(candidates: readonly Profile[]): string {
    const allowed = candidates.map((profile, index) => ({
      contextRank: index + 1,
      momentProfileId: profile.id,
      themes: profile.themes,
      reflectionSnippetIds: profile.snippet_ids,
      passageHints: profile.passage_hints,
      tone: profile.tone,
      workflowStages: profile.workflow_stages ?? [],
      liturgicalSeasons: profile.liturgical_seasons ?? [],
      observanceIds: profile.observance_ids ?? [],
      weight: profile.weight
    }));
    return [
      "You are the private, structured ranking layer for Grace in the Gap.",
      "Call select_grace_moment exactly once. Never return user-facing prose.",
      "Choose a profile, snippet, passage, and tone only from one internally consistent allowed profile.",
      "Prioritize an exact supplied lectionary reference, workflow stage, task fit, and non-repetition.",
      "contextRank is the local editorial prior after calendar, preferences, and repetition scoring; normally choose rank 1.",
      "Treat calendar and workflow as contextual signals; do not invent emotions or spiritual claims.",
      "Use durationSeconds 5 or 8, conservative confidence, fallbackVotd false, and needsAuth false.",
      "Return concise kebab-case reasonCodes that describe only supplied structured context.",
      `Allowed candidates: ${JSON.stringify(allowed)}`,
      "The function schema is authoritative."
    ].join("\n");
  }

  private buildSelectionTool(candidates: readonly Profile[]) {
    const profileIds = candidates.map((profile) => profile.id);
    const snippetIds = [...new Set(candidates.flatMap((profile) => profile.snippet_ids))];
    const passageHints = [...new Set(candidates.flatMap((profile) => profile.passage_hints))];
    const tones = [...new Set(candidates.map((profile) => profile.tone))];
    return {
      type: "function",
      function: {
        name: "select_grace_moment",
        description: "Select one editorially approved Grace moment by ID.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            momentProfileId: { type: "string", enum: profileIds },
            reflectionSnippetId: { type: "string", enum: snippetIds },
            passageHint: { type: "string", enum: passageHints },
            durationSeconds: { type: "integer", enum: [5, 8] },
            tone: { type: "string", enum: tones },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            fallbackVotd: { type: "boolean", enum: [false] },
            needsAuth: { type: "boolean", enum: [false] },
            reasonCodes: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: { type: "string", pattern: "^[a-z0-9-]+$" }
            }
          },
          required: [
            "momentProfileId",
            "reflectionSnippetId",
            "passageHint",
            "durationSeconds",
            "tone",
            "confidence",
            "fallbackVotd",
            "needsAuth",
            "reasonCodes"
          ]
        }
      }
    };
  }

  private extractDecisionPayload(body: unknown): string {
    const record = GenericObjectSchema.parse(body);
    const choices = record.choices;
    if (Array.isArray(choices)) {
      const first = GenericObjectSchema.safeParse(choices[0]);
      const message = first.success ? GenericObjectSchema.safeParse(first.data.message) : undefined;
      const toolCalls = message?.success ? message.data.tool_calls : undefined;
      if (Array.isArray(toolCalls)) {
        for (const toolCall of toolCalls) {
          const parsedCall = GenericObjectSchema.safeParse(toolCall);
          const functionCall = parsedCall.success
            ? GenericObjectSchema.safeParse(parsedCall.data.function)
            : undefined;
          if (
            functionCall?.success &&
            functionCall.data.name === "select_grace_moment" &&
            typeof functionCall.data.arguments === "string"
          ) {
            return functionCall.data.arguments.trim();
          }
        }
      }
      // Compatibility fallback for grounded accounts that return validated JSON
      // as assistant content even when a required tool was supplied.
      if (message?.success && typeof message.data.content === "string") {
        return message.data.content.trim();
      }
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
    throw new Error("Gloo response did not contain selection tool arguments");
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

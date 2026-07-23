import { createServer, type IncomingMessage, type Server } from "node:http";
import { listen } from "../../src/api/server.js";
import { ContentRepository } from "../../src/content/repository.js";
import { selectLocally } from "../../src/selection/local-selector.js";
import { buildManualEvent } from "../../src/privacy/normalize.js";
import { WaitEventSchema, type TaskType, type WaitEvent } from "../../src/domain.js";

/**
 * Test-only contract double for the Gloo and YouVersion HTTP APIs. It reproduces
 * the real request/response shapes (OAuth2 client credentials, Gloo V2 tools /
 * grounded, YouVersion Bible metadata + passages) so the production adapters can
 * be exercised end to end without billable calls. It is never bundled into the
 * product and is not reachable from any runtime command.
 */

export interface CapturedRequest {
  method: string;
  path: string;
  body: unknown;
}

export interface ContractServerOptions {
  invalidGlooJson?: boolean;
  failYouVersion?: boolean;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return undefined;
  if (request.headers["content-type"]?.includes("application/json")) {
    return JSON.parse(text) as unknown;
  }
  return text;
}

function findSafeInput(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.input)) {
    const first = record.input[0] as Record<string, unknown> | undefined;
    if (typeof first?.content === "string") return JSON.parse(first.content) as Record<string, unknown>;
  }
  if (Array.isArray(record.messages)) {
    const user = [...record.messages].reverse().find((item) => {
      return Boolean(item && typeof item === "object" && (item as Record<string, unknown>).role === "user");
    }) as Record<string, unknown> | undefined;
    if (typeof user?.content === "string") return JSON.parse(user.content) as Record<string, unknown>;
  }
  return {};
}

function buildEvent(input: Record<string, unknown>): WaitEvent {
  const taskType = typeof input.taskType === "string" ? input.taskType as TaskType : "unknown";
  const durationBucket = typeof input.durationBucket === "string" ? input.durationBucket : "8-15";
  const base = buildManualEvent({
    taskType,
    locale: typeof input.locale === "string" ? input.locale : "en-US",
    sessionSeed: "contract-test-session",
    timeZone: "UTC",
    tradition: "ecumenical",
    now: new Date("2026-07-18T14:00:00Z"),
    surface: "demo"
  });
  return WaitEventSchema.parse({
    ...base,
    taskTypes: Array.isArray(input.taskTypes) ? input.taskTypes : [taskType],
    estimatedWaitSeconds: durationBucket === "16-30" ? 20 : 12,
    durationBucket,
    timeWindow: typeof input.timeWindow === "string" ? input.timeWindow : "afternoon",
    workflowStage: typeof input.workflowStage === "string" ? input.workflowStage : "unknown",
    lastOutcome: typeof input.lastOutcome === "string" ? input.lastOutcome : "unknown",
    repeatBucket: typeof input.repeatBucket === "string" ? input.repeatBucket : "none",
    effortBucket: typeof input.effortBucket === "string" ? input.effortBucket : "sustained",
    preferredTone: typeof input.preferredTone === "string" ? input.preferredTone : "balanced",
    contextMode: input.contextMode === "local-labels" ? "local-labels" : "private"
  });
}

export async function startContractServer(
  options: ContractServerOptions = {}
): Promise<{ server: Server; baseUrl: string; requests: CapturedRequest[] }> {
  const content = new ContentRepository();
  const requests: CapturedRequest[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const body = request.method === "POST" ? await readBody(request) : undefined;
      requests.push({ method: request.method ?? "", path: url.pathname, body });
      response.setHeader("Content-Type", "application/json");

      if (request.method === "POST" && url.pathname === "/oauth2/token") {
        response.end(JSON.stringify({ access_token: "contract-gloo-token", expires_in: 3600, token_type: "Bearer" }));
        return;
      }

      if (
        request.method === "POST" &&
        ["/ai/v2/chat/completions", "/ai/v2/chat/completions/grounded"].includes(url.pathname)
      ) {
        const event = buildEvent(findSafeInput(body));
        const decision = selectLocally(event, content.candidatesFor(event));
        const text = options.invalidGlooJson ? "not valid JSON" : JSON.stringify(decision);
        response.end(JSON.stringify({
          id: "chatcmpl_contract",
          choices: [{
            message: options.invalidGlooJson
              ? { role: "assistant", content: text }
              : {
                  role: "assistant",
                  content: null,
                  tool_calls: [{
                    id: "call_contract",
                    type: "function",
                    function: { name: "select_grace_moment", arguments: text }
                  }]
                }
          }],
          ...(url.pathname.endsWith("grounded")
            ? { citations: ["contract://grounded-content/release"] }
            : {})
        }));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/bibles") {
        response.end(JSON.stringify({
          data: [{
            id: 3034,
            abbreviation: "WEB",
            title: "World English Bible",
            localized_title: "World English Bible",
            language_tag: "en",
            copyright: "\"World English Bible — Public Domain\""
          }]
        }));
        return;
      }

      const passageMatch = url.pathname.match(/^\/v1\/bibles\/([^/]+)\/passages\/([^/]+)$/);
      if (request.method === "GET" && passageMatch) {
        if (options.failYouVersion) {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "unavailable" }));
          return;
        }
        const usfm = decodeURIComponent(passageMatch[2] ?? "PSA.46.10");
        // Real passages endpoint returns a flat object with no copyright.
        response.end(JSON.stringify({
          id: usfm,
          content: `Contract passage text for ${content.referenceFor(usfm)}.`,
          reference: content.referenceFor(usfm)
        }));
        return;
      }

      const bibleMatch = url.pathname.match(/^\/v1\/bibles\/([^/]+)$/);
      if (request.method === "GET" && bibleMatch) {
        if (options.failYouVersion) {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "unavailable" }));
          return;
        }
        const versionId = decodeURIComponent(bibleMatch[1] ?? "3034");
        response.end(JSON.stringify({
          id: Number.parseInt(versionId, 10) || versionId,
          abbreviation: "WEB",
          title: "World English Bible",
          localized_title: "World English Bible",
          language_tag: "en",
          copyright: "\"World English Bible — Public Domain\""
        }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not_found" }));
    })().catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ error: "contract_server_error" }));
    });
  });
  const address = await listen(server, 0);
  return { server, baseUrl: `http://${address.host}:${address.port}`, requests };
}

/** Builds a RuntimeConfig pointed at a contract server with fake-but-present credentials. */
export function contractConfig(baseUrl: string, overrides: { endpointMode?: "tools" | "grounded" } = {}) {
  return {
    preferences: {
      enabled: true,
      locale: "en-US",
      bibleVersionId: "3034",
      timeZone: "UTC",
      tradition: "ecumenical" as const,
      preferredTone: "balanced" as const,
      showSelectionReason: true,
      historyLimit: 12,
      minimumWaitSeconds: 8,
      cooldownMinutes: 10,
      maxCardsPerDay: 6,
      contextMode: "private" as const,
      telemetryEnabled: false,
      demoAlways: false
    },
    dataDirectory: ".grace-data-test",
    gloo: {
      clientId: "contract-client",
      clientSecret: "contract-secret",
      baseUrl,
      model: "gloo-openai-gpt-5-mini",
      endpointMode: overrides.endpointMode ?? ("tools" as const),
      ragPublisher: overrides.endpointMode === "grounded" ? "GraceInTheGap" : "",
      tradition: ""
    },
    youVersion: {
      appKey: "contract-app-key",
      baseUrl
    }
  };
}

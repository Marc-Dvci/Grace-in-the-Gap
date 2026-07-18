import { createServer, type IncomingMessage, type Server } from "node:http";
import { listen } from "../../src/api/server.js";
import { ContentRepository } from "../../src/content/repository.js";
import { selectLocally } from "../../src/selection/local-selector.js";
import { WaitEventSchema, type TaskType, type WaitEvent } from "../../src/domain.js";

/**
 * Test-only contract double for the Gloo and YouVersion HTTP APIs. It reproduces
 * the real request/response shapes (OAuth2 client-credentials, Gloo Responses /
 * Grounded, YouVersion Bible metadata + Passages) so the production adapters can
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
  return WaitEventSchema.parse({
    surface: "demo",
    taskType,
    estimatedWaitSeconds: durationBucket === "16-30" ? 20 : 12,
    durationBucket,
    locale: typeof input.locale === "string" ? input.locale : "en-US",
    timeWindow: typeof input.timeWindow === "string" ? input.timeWindow : "afternoon",
    sessionHash: "contract-test-session",
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
        ["/ai/v1/responses", "/ai/v2/chat/completions/grounded"].includes(url.pathname)
      ) {
        const event = buildEvent(findSafeInput(body));
        const decision = selectLocally(event, content.candidatesFor(event));
        const text = options.invalidGlooJson ? "not valid JSON" : JSON.stringify(decision);
        if (url.pathname.endsWith("grounded")) {
          response.end(JSON.stringify({
            choices: [{ message: { role: "assistant", content: text } }],
            citations: ["contract://grounded-content/release"]
          }));
        } else {
          response.end(JSON.stringify({
            id: "resp_contract",
            object: "response",
            output: [{
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text }]
            }],
            usage: { input_tokens: 100, output_tokens: 60, total_tokens: 160 }
          }));
        }
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
        const passage = content.getOfflinePassage(usfm, "en-US");
        // Real passages endpoint returns a flat object with no copyright.
        response.end(JSON.stringify({ id: usfm, content: passage.text, reference: passage.reference }));
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
export function contractConfig(baseUrl: string, overrides: { endpointMode?: "responses" | "grounded" } = {}) {
  return {
    preferences: {
      enabled: true,
      locale: "en-US",
      bibleVersionId: "3034",
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
      endpointMode: overrides.endpointMode ?? ("responses" as const),
      ragPublisher: overrides.endpointMode === "grounded" ? "GraceInTheGap" : "",
      tradition: ""
    },
    youVersion: {
      appKey: "contract-app-key",
      baseUrl
    }
  };
}

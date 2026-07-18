import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { z } from "zod";
import { WaitEventSchema } from "../domain.js";
import type { ServiceBundle } from "../service/factory.js";
import { createService } from "../service/factory.js";

const MAX_BODY_BYTES = 32 * 1024;

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds 32 KiB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(serialized),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(serialized);
}

export function createApiServer(bundle: ServiceBundle = createService()): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, {
          status: "ok",
          provider: "gloo + youversion (live)",
          contentRelease: bundle.content.release,
          telemetryEnabled: bundle.config.preferences.telemetryEnabled
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/moments") {
        const event = WaitEventSchema.parse(await readJson(request));
        send(response, 200, await bundle.service.create(event));
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/content/manifest") {
        send(response, 200, {
          release: bundle.content.release,
          profileCount: bundle.content.profiles.length,
          reviewNotice: bundle.content.reviewNotice
        });
        return;
      }
      send(response, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        send(response, 400, { error: "invalid_request", details: error.message });
      } else {
        send(response, 502, {
          error: "upstream_failure",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  });
}

export async function listen(
  server: Server,
  port: number,
  host = "127.0.0.1"
): Promise<{ port: number; host: string }> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("API server did not bind a TCP port");
  return { port: address.port, host };
}

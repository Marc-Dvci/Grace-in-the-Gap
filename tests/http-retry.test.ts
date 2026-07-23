import { describe, expect, it } from "vitest";
import { fetchJsonWithRetry } from "../src/providers/http.js";

describe("bounded provider retries", () => {
  it("retries one transient response and then returns parsed JSON", async () => {
    let calls = 0;
    const fetchImplementation = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("busy", {
          status: 503,
          headers: { "Retry-After": "0" }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    await expect(fetchJsonWithRetry(
      fetchImplementation,
      "https://provider.test/resource",
      { method: "GET" },
      1_000,
      "Provider"
    )).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});

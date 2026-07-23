import { describe, expect, it } from "vitest";
import { YouVersionProvider } from "../src/providers/youversion.js";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("YouVersion locale-aware Bible resolution", () => {
  it("replaces a configured Bible whose language does not match the user locale", async () => {
    const requests: Array<{ url: URL; headers: Headers }> = [];
    let collectionCalls = 0;
    const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requests.push({ url, headers: new Headers(init?.headers) });
      if (url.pathname === "/v1/bibles/3034") {
        return json({
          id: 3034,
          abbreviation: "WEB",
          language_tag: "en",
          copyright: "Public Domain"
        });
      }
      if (url.pathname === "/v1/bibles") {
        collectionCalls += 1;
        if (collectionCalls === 1) {
          return json({ data: [], next_page_token: "page-2" });
        }
        return json({
          data: [{
            id: 123,
            abbreviation: "BFR",
            language_tag: "fr",
            copyright: "Utilisé avec autorisation"
          }]
        });
      }
      if (url.pathname === "/v1/bibles/123") {
        return json({
          id: 123,
          abbreviation: "BFR",
          language_tag: "fr",
          copyright: "\"Utilisé avec autorisation\""
        });
      }
      if (url.pathname === "/v1/bibles/123/passages/JAS.1.5") {
        return json({
          id: "JAS.1.5",
          reference: "Jacques 1.5",
          content: "«Si l'un de vous manque de sagesse...»"
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const provider = new YouVersionProvider({
      appKey: "test-app-key",
      baseUrl: "https://youversion.test",
      fetchImplementation
    });
    const result = await provider.getPassage("3034", "JAS.1.5", "fr-FR");

    expect(result.passage.versionId).toBe("123");
    expect(result.passage.locale).toBe("fr");
    expect(result.passage.reference).toBe("Jacques 1.5");
    expect(result.passage.text).toBe("Si l'un de vous manque de sagesse...");
    expect(result.passage.copyright).toBe("Utilisé avec autorisation");
    const collection = requests.find((request) => request.url.pathname === "/v1/bibles");
    expect(collection?.url.searchParams.get("language_ranges")).toBe("fr*");
    const secondCollection = requests.filter((request) => request.url.pathname === "/v1/bibles")[1];
    expect(secondCollection?.url.searchParams.get("page_token")).toBe("page-2");
    expect(requests.every((request) => request.headers.get("X-YVP-App-Key") === "test-app-key"))
      .toBe(true);

    // A retired/unlicensed configured ID also falls back to language discovery.
    collectionCalls = 1;
    const recovered = await provider.getPassage("999", "JAS.1.5", "fr-FR");
    expect(recovered.passage.versionId).toBe("123");
  });
});

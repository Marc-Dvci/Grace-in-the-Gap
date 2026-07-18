export type FetchLike = typeof fetch;

export async function fetchWithTimeout(
  fetchImplementation: FetchLike,
  input: string | URL,
  init: RequestInit,
  timeoutMilliseconds = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    return await fetchImplementation(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseJsonResponse(response: Response, providerName: string): Promise<unknown> {
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${providerName} returned HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error(`${providerName} returned invalid JSON`);
  }
}

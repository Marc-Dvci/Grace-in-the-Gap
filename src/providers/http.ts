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

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(2_000, Math.max(0, seconds * 1_000));
  }
  return 150 * (2 ** attempt);
}

/** One bounded retry for network errors, rate limits, and transient upstream failures. */
export async function fetchJsonWithRetry(
  fetchImplementation: FetchLike,
  input: string | URL,
  init: RequestInit,
  timeoutMilliseconds: number,
  providerName: string,
  attempts = 2
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetchWithTimeout(fetchImplementation, input, init, timeoutMilliseconds);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(undefined, attempt)));
      continue;
    }
    const transient = response.status === 429 || response.status >= 500;
    if (!transient || attempt === attempts - 1) {
      return parseJsonResponse(response, providerName);
    }
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
  }
  throw lastError instanceof Error ? lastError : new Error(`${providerName} request failed`);
}

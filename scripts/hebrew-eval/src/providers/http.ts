export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | undefined,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

export interface PostJsonResult<T> {
  status: number;
  json: T;
  latencyMs: number;
}

/** POST JSON with a timeout; non-2xx -> ProviderError (retryable for 408/409/429/5xx/network). */
export async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<PostJsonResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  const onOuterAbort = () => controller.abort(outerSignal?.reason);
  outerSignal?.addEventListener('abort', onOuterAbort, { once: true });
  const t0 = performance.now();
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      const isTimeout = controller.signal.aborted && String(controller.signal.reason).includes('timeout');
      throw new ProviderError(isTimeout ? `timeout after ${timeoutMs}ms` : `network error: ${msg}`, undefined, true);
    }
    const latencyMs = Math.round(performance.now() - t0);
    const text = await res.text();
    if (!res.ok) {
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new ProviderError(
        `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 600)}`,
        res.status,
        RETRYABLE_STATUS.has(res.status),
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      );
    }
    let json: T;
    try {
      json = JSON.parse(text) as T;
    } catch {
      throw new ProviderError(`invalid JSON response: ${text.slice(0, 200)}`, res.status, true);
    }
    return { status: res.status, json, latencyMs };
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onOuterAbort);
  }
}

export function stringifyToolOutput(output: unknown): string {
  return typeof output === 'string' ? output : JSON.stringify(output ?? null);
}

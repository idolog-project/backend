export function retryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = Number(Reflect.get(error, 'status'));
  return (
    status === 429 ||
    status === 499 ||
    (status >= 500 && status <= 599) ||
    ['AbortError', 'TimeoutError'].includes(error.name) ||
    error instanceof TypeError ||
    /network|fetch failed|timeout|timed out|ECONNRESET|ETIMEDOUT/i.test(error.message)
  );
}
export async function networkRetry<T>(
  operation: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 2 || !retryable(error)) throw error;
      await sleep(250 * 2 ** attempt + Math.floor(Math.random() * 200));
    }
  }
}

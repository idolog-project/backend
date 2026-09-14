/** Only structured quota violations identify a daily limit; free text is not evidence. */
export function geminiQuotaCode(error: Error): 'GEMINI_DAILY_LIMIT' | 'GEMINI_RATE_LIMIT' {
  try {
    const parsed: unknown = JSON.parse(error.message);
    if (!isRecord(parsed) || !isRecord(parsed.error)) return 'GEMINI_RATE_LIMIT';
    const details = parsed.error.details;
    if (!Array.isArray(details)) return 'GEMINI_RATE_LIMIT';
    for (const detail of details) {
      if (
        !isRecord(detail) ||
        detail['@type'] !== 'type.googleapis.com/google.rpc.QuotaFailure' ||
        !Array.isArray(detail.violations)
      )
        continue;
      for (const violation of detail.violations) {
        if (!isRecord(violation)) continue;
        if (
          [violation.quotaId, violation.quotaMetric].some(
            (value) => typeof value === 'string' && /per[_-]?day|daily/i.test(value),
          )
        ) {
          return 'GEMINI_DAILY_LIMIT';
        }
      }
    }
  } catch {
    // Do not expose provider messages, project identifiers or credentials.
  }
  return 'GEMINI_RATE_LIMIT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

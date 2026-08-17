export type ReliabilityErrorKind = 'offline' | 'timeout' | 'server-refusal' | 'permission-denied' | 'conflict' | 'unknown';

export type ReliabilityError = {
  kind: ReliabilityErrorKind;
  message: string;
  recovery: 'retry-automatically' | 'retry' | 'review-and-retry' | 'sign-in-again' | 'refresh' | 'report-problem';
  retryable: boolean;
};

const DEFINITIONS: Record<ReliabilityErrorKind, Omit<ReliabilityError, 'kind'>> = {
  offline: { message: 'Binder cannot reach the network. It will reconnect automatically.', recovery: 'retry-automatically', retryable: true },
  timeout: { message: 'Binder took too long to respond. Try again.', recovery: 'retry', retryable: true },
  'server-refusal': { message: 'Binder could not complete that request. Check the details and try again.', recovery: 'review-and-retry', retryable: false },
  'permission-denied': { message: 'Your session does not allow that action. Sign in again and retry.', recovery: 'sign-in-again', retryable: false },
  conflict: { message: 'That changed on another device. Refresh to see the latest version.', recovery: 'refresh', retryable: false },
  unknown: { message: 'Something unexpected happened. Try again, then report the problem if it continues.', recovery: 'report-problem', retryable: true },
};

function errorText(value: unknown): string {
  if (value instanceof Error) return `${value.name} ${value.message}`.toLowerCase();
  if (typeof value === 'string') return value.toLowerCase();
  if (value && typeof value === 'object') {
    const error = value as { code?: unknown; message?: unknown; status?: unknown };
    return `${String(error.code ?? '')} ${String(error.message ?? '')} ${String(error.status ?? '')}`.toLowerCase();
  }
  return '';
}

/**
 * A request that never reached the server.
 *
 * The message a fetch failure carries differs by platform, engine and SDK, so
 * matching text alone missed real outages: the first screen of the app told an
 * offline user that Binder's safety rules could not be verified, which sounds
 * like a policy problem and is not one. A refusal from the server always
 * carries a PostgREST code or an HTTP status; a transport failure carries
 * neither, and that is the reliable signal.
 */
export function isLikelyOffline(value: unknown): boolean {
  if (classifyError(value).kind === 'offline') return true;
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { code?: unknown; status?: unknown; statusCode?: unknown };
  const hasServerAnswer = Boolean(candidate.code) || Boolean(candidate.status) || Boolean(candidate.statusCode);
  return !hasServerAnswer;
}

export function classifyError(value: unknown): ReliabilityError {
  const text = errorText(value);
  let kind: ReliabilityErrorKind = 'unknown';
  if (/aborterror|aborted|cancelled|canceled/.test(text)) kind = 'unknown';
  else if (/timeout|timed out|57014/.test(text)) kind = 'timeout';
  else if (/network request failed|failed to fetch|network|offline|connection|econn|enotfound/.test(text)) kind = 'offline';
  else if (/permission|not authorized|unauthorized|forbidden|authentication required|\b401\b|\b403\b|42501/.test(text)) kind = 'permission-denied';
  // 23505 (unique violation) really is a concurrent edit. 23503 (foreign key)
  // means the thing being referenced is gone, which refreshing cannot fix.
  else if (/23503/.test(text)) kind = 'server-refusal';
  else if (/conflict|duplicate|already exists|unique|\b409\b|23505/.test(text)) kind = 'conflict';
  else if (/server|refused|rejected|invalid|bad request|\b400\b|\b422\b|pgrst/.test(text)) kind = 'server-refusal';
  return { kind, ...DEFINITIONS[kind] };
}

export function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError';
}

export function isConversationEndedError(value: unknown): boolean {
  return /conversation is no longer active|active match membership required/i.test(errorText(value));
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('The request was cancelled.');
  error.name = 'AbortError';
  throw error;
}

export function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      const error = new Error('The request was cancelled.');
      error.name = 'AbortError';
      reject(error);
    };
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error) => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
};

export function backoffDelay(attempt: number, baseDelayMs = 500, maximumMs = 8_000): number {
  return Math.min(maximumMs, baseDelayMs * 2 ** Math.max(0, attempt));
}

export function cancellableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const timer = setTimeout(done, delayMs);
    function done() { signal?.removeEventListener('abort', cancel); resolve(); }
    function cancel() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); const error = new Error('The request was cancelled.'); error.name = 'AbortError'; reject(error); }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function withRetry<T>(operation: (signal?: AbortSignal) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const sleep = options.sleep ?? cancellableDelay;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    throwIfAborted(options.signal);
    try { return await operation(options.signal); }
    catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      if (!classifyError(error).retryable || attempt === attempts - 1) throw error;
      await sleep(backoffDelay(attempt, options.baseDelayMs), options.signal);
    }
  }
  throw lastError;
}

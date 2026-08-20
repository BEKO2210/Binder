export type ReliabilityErrorKind = 'offline' | 'timeout' | 'server-refusal' | 'permission-denied' | 'conflict' | 'unknown';

export type ReliabilityError = {
  kind: ReliabilityErrorKind;
  // A translation key, not a sentence. These end up on screen in Matches, Chat
  // and Discovery, and this module cannot translate anything itself — it is
  // imported by plain node tests and must stay free of React. The screen that
  // shows it resolves the key.
  messageKey: string;
  recovery: 'retry-automatically' | 'retry' | 'review-and-retry' | 'sign-in-again' | 'refresh' | 'report-problem';
  retryable: boolean;
};

const DEFINITIONS: Record<ReliabilityErrorKind, Omit<ReliabilityError, 'kind'>> = {
  offline: { messageKey: 'reliability.offline', recovery: 'retry-automatically', retryable: true },
  timeout: { messageKey: 'reliability.timeout', recovery: 'retry', retryable: true },
  'server-refusal': { messageKey: 'reliability.serverRefusal', recovery: 'review-and-retry', retryable: false },
  'permission-denied': { messageKey: 'reliability.permissionDenied', recovery: 'sign-in-again', retryable: false },
  conflict: { messageKey: 'reliability.conflict', recovery: 'refresh', retryable: false },
  unknown: { messageKey: 'reliability.unknown', recovery: 'report-problem', retryable: true },
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

/**
 * The classification a screen should show for a failed request.
 *
 * `classifyError` reads what the error says. A transport failure often says
 * nothing recognisable — a dropped realtime channel arrives as a bare status
 * string, and some engines word a lost connection differently — so a plain
 * offline moment reached the chat as "unknown" and the person was told that
 * something unexpected had happened and they should report it. Airplane mode
 * is not unexpected and there is nothing to report.
 *
 * So: what the error says first, and only where that yields nothing, the
 * question `isLikelyOffline` already answers — did any server answer at all.
 */
/**
 * The shapes a JavaScript engine uses to report a fault in the program itself.
 * A failed request never looks like this: React Native reports a dead network
 * as a TypeError too, but with "Network request failed", which is matched long
 * before this is asked.
 */
function isProgrammingError(value: unknown): boolean {
  if (!(value instanceof TypeError) && !(value instanceof ReferenceError)) return false;
  return /undefined is not|null is not|is not a function|cannot read|cannot access|is not defined/i.test(String(value.message ?? ''));
}

export function classifyRequestFailure(value: unknown): ReliabilityError {
  const classified = classifyError(value);
  if (classified.kind !== 'unknown') return classified;
  // A mistake in our own code is not a tunnel. Without this, a TypeError from
  // a bug in the request path was shown as "no network" and retried
  // automatically for as long as somebody kept the screen open — a loop that
  // hides the actual fault behind a message about the person's connection.
  if (isProgrammingError(value)) return classified;
  // A bare status string carries no code and no status either, which is the
  // same evidence an object without them gives: nothing answered.
  const asAnswer = typeof value === 'string' ? { message: value } : value;
  return isLikelyOffline(asAnswer) ? { kind: 'offline', ...DEFINITIONS.offline } : classified;
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

// An own marker rather than the name alone: any library is free to raise a
// TimeoutError, and the caller below changes how the error is presented, so it
// has to recognise its own deadline and nothing else. The property is one this
// module owns, and it is not `code` or `status` — those two decide whether an
// error counts as offline, and a marker must not quietly answer that question.
const DEADLINE_MARKER = '__binderDeadline';

export function deadlineError(): Error {
  const error = new Error('Binder timed out waiting for an answer.');
  error.name = 'TimeoutError';
  return Object.assign(error, { [DEADLINE_MARKER]: true });
}

/**
 * Exactly the deadline this module raises — not "anything that reads like a
 * timeout".
 *
 * `isLikelyOffline` deliberately treats an answer that never arrived as
 * offline, and the SIGNED_OUT check depends on that: no server answer there
 * means the phone was in a tunnel, not that the session ended. A caller that
 * set a deadline itself knows better for its own call, and only for its own
 * call, so it asks this instead of widening that shared rule.
 */
export function isDeadlineError(value: unknown): boolean {
  return value instanceof Error && (value as unknown as Record<string, unknown>)[DEADLINE_MARKER] === true;
}

/**
 * A ceiling on how long a request may stay unanswered.
 *
 * A failed request rejects and the screen behind it can say so. A request on a
 * socket the phone quietly lost does neither: it waits, and every loading state
 * waiting on it waits forever. That is what put "Checking Binder safety rules…"
 * on the screen with no tab bar, no message and no retry after a notification
 * was tapped. Only the promise handed in is bounded — the work behind it cannot
 * be recalled, so this is a ceiling on waiting, not a cancellation.
 *
 * It takes a PromiseLike rather than a Promise because Supabase's query builder
 * is a thenable, not a promise, and the whole point is to be able to put a
 * ceiling on exactly those calls.
 */
export function withDeadline<T>(operation: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(deadlineError()), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
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

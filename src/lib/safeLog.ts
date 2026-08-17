type LogLevel = 'info' | 'warn' | 'error';

const PRIVATE_KEY = /token|secret|password|email|body|message|latitude|longitude|coordinate|session|authorization|cookie/i;

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'undefined') return value;
  if (typeof value === 'string') return '[redacted]';
  if (typeof value !== 'object') return `[${typeof value}]`;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, PRIVATE_KEY.test(key) ? '[redacted]' : redact(item, seen)]));
}

/** Development-only structured logging. Release builds never call console.*. */
export function safeLog(level: LogLevel, event: string, context?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const payload = context ? redact(context) : undefined;
  if (level === 'error') console.error(event, payload);
  else if (level === 'warn') console.warn(event, payload);
  else console.info(event, payload);
}

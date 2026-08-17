export type RecoveryCallback = { code: string };

const CALLBACK_SCHEME = 'binder:';
const CALLBACK_HOST = 'reset-password';
const MAX_CALLBACK_URL_LENGTH = 8192;
const MAX_TOKEN_LENGTH = 4096;
const OPAQUE_PATTERN = /^[A-Za-z0-9._~-]+$/;

function singleParameter(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  return values.length === 1 ? values[0]! : null;
}

function validOpaque(value: string | null): value is string {
  return Boolean(value && value.length <= MAX_TOKEN_LENGTH && OPAQUE_PATTERN.test(value));
}

/** Parse only Binder's password-recovery callback. Never returns raw URL data in an error. */
export function parseRecoveryCallback(rawUrl: string): RecoveryCallback | null {
  if (!rawUrl || rawUrl.length > MAX_CALLBACK_URL_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== CALLBACK_SCHEME
    || url.hostname !== CALLBACK_HOST
    || url.username
    || url.password
    || url.port
    || (url.pathname !== '' && url.pathname !== '/')
  ) return null;

  const query = url.searchParams;
  const code = singleParameter(query, 'code');
  // Binder uses PKCE. A code is harmless without the verifier created and
  // securely stored on the device that requested the reset. Bearer tokens in
  // URL fragments are deliberately never accepted.
  if (url.hash || !validOpaque(code)) return null;
  for (const key of query.keys()) if (key !== 'code') return null;
  return { code };
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const dispatch = readFileSync(new URL('../supabase/functions/dispatch-push/index.ts', import.meta.url), 'utf8');
const invite = readFileSync(new URL('../supabase/functions/invite-moderator/index.ts', import.meta.url), 'utf8');

test('who may call a function is written down, not left to a dashboard', () => {
  // verify_jwt decides whether the platform checks a token before the function
  // runs at all. Without this file it was whatever somebody last clicked,
  // changeable by anybody with access and invisible in review.
  // Every one of them, including the dispatcher: the scheduled job sends a
  // token as well as the shared secret, so the platform check costs nothing
  // and stops everything that has neither before the function runs. The file
  // used to say false here, which would have been a deployment quietly
  // relaxing what production already does.
  assert.match(config, /\[functions\.dispatch-push\]\s*\nverify_jwt = true/);
  assert.match(config, /\[functions\.delete-account\]\s*\nverify_jwt = true/);
  assert.match(config, /\[functions\.invite-moderator\]\s*\nverify_jwt = true/);
});

test('the server insists on a confirmed address and a password of its own', () => {
  // The client refuses anything shorter than eight, and a client is not a rule.
  assert.match(config, /enable_confirmations = true/);
  assert.match(config, /minimum_password_length = 8/);
});

test('the dispatch secret is compared in constant time', () => {
  // `!==` returns at the first byte that differs. Over enough requests that
  // time is the secret, one character at a time — and behind this header is
  // the whole push queue.
  assert.match(dispatch, /function secretMatches\(/);
  assert.match(dispatch, /difference \|= \(a\[index\] \?\? 0\) \^ \(b\[index\] \?\? 0\);/);
  assert.match(dispatch, /if \(!secretMatches\(req\.headers\.get\("x-binder-dispatch-secret"\), environment\.dispatchSecret\)\)/);
  assert.doesNotMatch(dispatch, /x-binder-dispatch-secret"\) !== /);
});

test('a page on localhost cannot invite a moderator', () => {
  // The browser would allow it, because the function told it the origin was
  // fine. That is only true while somebody is building the admin page on their
  // own machine, so it is off unless the deployment turns it on.
  assert.match(invite, /const ALLOW_LOCAL_ADMIN = Deno\.env\.get\("BINDER_ADMIN_ALLOW_LOCALHOST"\) === "true";/);
  assert.match(invite, /if \(ALLOW_LOCAL_ADMIN && \/\^http/);
});

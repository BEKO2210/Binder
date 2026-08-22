import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { SIGNED_URL_LIFETIME_MS, SIGNED_URL_MARGIN_MS, SIGNED_URL_SECONDS, signedUrlsAreStale } from '../src/lib/signedUrlLifetime.ts';

test('a link is good for half an hour, everywhere', () => {
  // Two places disagreed — thirty minutes for a profile photo, an hour for the
  // same photo inside a conversation — which meant the short one, the one
  // written down as a safety promise, was not actually the rule.
  assert.equal(SIGNED_URL_SECONDS, 60 * 30);
  const offenders: string[] = [];
  for (const name of readdirSync(new URL('../src/lib', import.meta.url))) {
    if (!name.endsWith('.ts')) continue;
    const source = readFileSync(new URL(`../src/lib/${name}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/createSignedUrl\([^,]+,\s*([^)]+)\)/g)) {
      if (match[1]?.trim() !== 'SIGNED_URL_SECONDS') offenders.push(`src/lib/${name}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('links are refreshed before they die, not after', () => {
  // One fetched five minutes before expiry is still one that breaks while
  // somebody is looking at it.
  assert.ok(SIGNED_URL_MARGIN_MS > 0 && SIGNED_URL_MARGIN_MS < SIGNED_URL_LIFETIME_MS);
  const loadedAt = 1_000_000;
  assert.equal(signedUrlsAreStale(loadedAt, loadedAt + 60_000), false, 'a minute away is not stale');
  assert.equal(signedUrlsAreStale(loadedAt, loadedAt + SIGNED_URL_LIFETIME_MS - SIGNED_URL_MARGIN_MS), true);
  assert.equal(signedUrlsAreStale(loadedAt, loadedAt + SIGNED_URL_LIFETIME_MS), true);
});

test('every screen holding photo links asks for them again when it comes back', () => {
  // They were fetched at mount and never again. A phone left in a pocket came
  // back to grey rectangles, and the only way to ask for them again was
  // leaving the screen and returning to it.
  for (const screen of ['DiscoveryScreen', 'MatchesScreen', 'ProfileScreen', 'PartnerProfileScreen']) {
    const source = readFileSync(new URL(`../src/screens/${screen}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /useFreshSignedMedia\(/, `${screen} never refreshes its links`);
  }
});

test('coming back a minute later does not re-run every request on the screen', () => {
  const source = readFileSync(new URL('../src/lib/signedMedia.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(state !== 'active'\) return;/);
  assert.match(source, /if \(!signedUrlsAreStale\(loadedAt\.current, now\)\) return;/);
  assert.match(source, /subscription\.remove\(\)/);
});

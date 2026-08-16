import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bannerOffersEnable, bannerStateAfterRegistration, initialBannerState } from '../src/lib/pushBanner.ts';

test('an already-registered installation shows enabled on mount', () => {
  assert.equal(initialBannerState(true, 'granted'), 'enabled');
});

test('a revoked permission shows the denied guidance on mount', () => {
  assert.equal(initialBannerState(true, 'denied'), 'denied');
  assert.equal(initialBannerState(false, 'denied'), 'denied');
});

test('a fresh installation offers the enable action', () => {
  assert.equal(initialBannerState(false, 'undetermined'), 'idle');
  assert.equal(initialBannerState(false, 'granted'), 'idle');
});

test('registration outcomes map to distinct banner states', () => {
  assert.equal(bannerStateAfterRegistration('registered'), 'enabled');
  assert.equal(bannerStateAfterRegistration('denied'), 'denied');
  assert.equal(bannerStateAfterRegistration('offline'), 'offline');
  assert.equal(bannerStateAfterRegistration('missing-project-id'), 'unavailable');
  assert.equal(bannerStateAfterRegistration('unsupported'), 'unavailable');
});

test('only retryable states keep offering the enable action', () => {
  assert.equal(bannerOffersEnable('idle'), true);
  assert.equal(bannerOffersEnable('offline'), true);
  assert.equal(bannerOffersEnable('enabled'), false);
  assert.equal(bannerOffersEnable('denied'), false);
  assert.equal(bannerOffersEnable('unavailable'), false);
});

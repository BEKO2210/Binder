import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bannerOffersEnable, bannerStateAfterRegistration, initialBannerState, pushBlockedOnThisDevice, pushSettingsWarning } from '../src/lib/pushBanner.ts';

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

test('the account preference and this phone\'s permission are not the same claim', () => {
  // App settings showed only the preference, so switching Binder off in the
  // Android settings left it reading "on" with nothing able to deliver.
  assert.equal(pushBlockedOnThisDevice(true, 'denied'), true);
  assert.equal(pushBlockedOnThisDevice(true, 'undetermined'), true);
  assert.equal(pushBlockedOnThisDevice(true, 'granted'), false);
  // Nothing to contradict when the person turned it off themselves.
  assert.equal(pushBlockedOnThisDevice(false, 'denied'), false);
  assert.equal(pushBlockedOnThisDevice(false, 'granted'), false);
});

test('app settings warn about every way push can be dead, and stay quiet otherwise', () => {
  const W = pushSettingsWarning;
  // Nothing to warn about when the person turned push off themselves.
  assert.equal(W(false, 'denied', null), null);
  assert.equal(W(false, 'granted', 'registered'), null);
  // Still reading the permission: no accusation before the answer is in.
  assert.equal(W(true, null, null), null);
  // The permission is missing, in either of its two very different flavours.
  assert.equal(W(true, 'denied', null), 'appSettings.messages.pushDenied');
  assert.equal(W(true, 'undetermined', null), 'appSettings.messages.pushNotAllowedYet');
  // The healthy case.
  assert.equal(W(true, 'granted', 'registered'), null);
  // The case nobody would ever notice: allowed, switched on, and the
  // registration never reached the server anyway.
  assert.equal(W(true, 'granted', 'offline'), 'appSettings.messages.pushOffline');
  assert.equal(W(true, 'granted', 'missing-project-id'), 'appSettings.messages.missingProject');
  assert.equal(W(true, 'granted', 'unsupported'), 'appSettings.messages.pushUnavailable');
  // A refusal that arrives through the registration rather than the permission.
  assert.equal(W(true, 'granted', 'denied'), 'appSettings.messages.pushDenied');
  // Registration not checked yet says nothing either.
  assert.equal(W(true, 'granted', null), null);
});

test('a thrown check fails visibly and stays retryable', () => {
  // Neither of the existing states fits: 'offline' tells people to check a
  // connection that may be fine, and 'unavailable' is a dead end with no way
  // to try again. Both would be a wrong answer to "something threw".
  assert.equal(bannerOffersEnable('failed'), true);
  assert.equal(bannerOffersEnable('offline'), true);
  assert.equal(bannerOffersEnable('unavailable'), false);
  assert.equal(bannerOffersEnable('denied'), false);
  assert.equal(bannerOffersEnable('enabled'), false);
});

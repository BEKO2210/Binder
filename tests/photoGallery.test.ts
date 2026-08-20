import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  backClosesViewer, canAddPhoto, canMakePrimary, canReplacePhoto, canRetryUpload, moveTarget, orderForReplacement,
} from '../src/lib/photoGallery.ts';

const free = { busy: false, uploadLocked: false };
const working = { busy: true, uploadLocked: false };
const uploading = { busy: false, uploadLocked: true };

test('adding stops at six photos, and at anything already running', () => {
  assert.equal(canAddPhoto(0, free), true);
  assert.equal(canAddPhoto(5, free), true);
  assert.equal(canAddPhoto(6, free), false);
  assert.equal(canAddPhoto(7, free), false);
  assert.equal(canAddPhoto(1, working), false);
  assert.equal(canAddPhoto(1, uploading), false);
});

test('retry needs a failed upload that still holds its prepared image', () => {
  assert.equal(canRetryUpload({ phase: 'error', hasImage: true }, free), true);
  // No image left: pressing retry would send nothing and clear the error, which
  // reads as success.
  assert.equal(canRetryUpload({ phase: 'error', hasImage: false }, free), false);
  assert.equal(canRetryUpload({ phase: 'uploading', hasImage: true }, free), false);
  assert.equal(canRetryUpload({ phase: 'preparing', hasImage: false }, free), false);
  assert.equal(canRetryUpload(null, free), false);
  assert.equal(canRetryUpload({ phase: 'error', hasImage: true }, uploading), false);
});

test('a move that would leave the gallery is not a move', () => {
  assert.equal(moveTarget(0, 1, 3, free), 1);
  assert.equal(moveTarget(2, -1, 3, free), 1);
  assert.equal(moveTarget(0, -1, 3, free), null);
  assert.equal(moveTarget(2, 1, 3, free), null);
  assert.equal(moveTarget(-1, 1, 3, free), null);
  assert.equal(moveTarget(3, -1, 3, free), null);
  assert.equal(moveTarget(0, 1, 3, working), null);
});

test('only an approved photo that is not already first can become first', () => {
  assert.equal(canMakePrimary({ position: 1, moderationStatus: 'approved' }, free), true);
  assert.equal(canMakePrimary({ position: 0, moderationStatus: 'approved' }, free), false);
  assert.equal(canMakePrimary({ position: 1, moderationStatus: 'pending' }, free), false);
  assert.equal(canMakePrimary({ position: 1, moderationStatus: 'rejected' }, free), false);
  assert.equal(canMakePrimary({ position: 1, moderationStatus: 'approved' }, working), false);
});

test('replacing runs an upload, so it takes the same lock as adding', () => {
  assert.equal(canReplacePhoto(free), true);
  assert.equal(canReplacePhoto(working), false);
  assert.equal(canReplacePhoto(uploading), false);
});

test('the replacement order still comes from the one module that decides it', () => {
  assert.equal(orderForReplacement(5), 'upload-first');
  assert.equal(orderForReplacement(6), 'remove-first');
});

test('back leaves the full photo before it leaves the screen behind it', () => {
  assert.equal(backClosesViewer(0), true);
  assert.equal(backClosesViewer(3), true);
  assert.equal(backClosesViewer(null), false);

  // Both screens with a full-photo viewer have to honour it, or back still
  // costs the whole screen on one of them.
  for (const screen of ['PartnerProfileScreen', 'ProfileSettingsScreen']) {
    const source = readFileSync(new URL(`../src/screens/${screen}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /backClosesViewer\(viewerIndex\)/, `${screen} ignores the viewer on back`);
    assert.match(source, /setViewerIndex\(null\); return true;|setViewerIndex\(null\);\s*\n\s*return true;/, `${screen} does not close the viewer on back`);
  }
});

test('evidence counts across a commit that only wrote evidence down', () => {
  // Writing the evidence file is itself a commit, so every device run after a
  // build lands one commit later than the artefacts. That made a fully checked
  // candidate read NOT READY. The rule is the source tree, not the hash: the
  // difference between the two commits has to live entirely in artifacts/.
  const source = readFileSync(new URL('../scripts/release-candidate.mjs', import.meta.url), 'utf8');
  assert.match(source, /changed\.length > 0 && changed\.every\(\(path\) => path\.startsWith\('artifacts\/'\)\)/);
  // And both places that compare commits go through it.
  assert.equal(source.match(/sameSourceTree\(/g)?.length, 3);
  assert.doesNotMatch(source, /performance\.commit === release\.commit/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/lib/media.ts', import.meta.url), 'utf8');
const removal = source.slice(source.indexOf('export async function removeProfileMedia'), source.indexOf('export async function signedProfileImageUrl'));

test('the server decides before a photo file is deleted', () => {
  // Deleting the object first and asking afterwards left the row pointing at a
  // file that no longer existed whenever the server refused — which it does for
  // the last approved photo, the case people actually run into.
  const rpc = removal.indexOf("'remove_my_profile_media'");
  const remove = removal.indexOf(".remove(");
  assert.ok(rpc > 0, 'the removal still goes through the server');
  assert.ok(remove > 0, 'the file is still cleaned up');
  assert.ok(rpc < remove, 'the row is removed first, the file second');
});

test('a refusal from the server leaves the file alone', () => {
  const rpc = removal.indexOf("'remove_my_profile_media'");
  const guard = removal.indexOf('if (error) throw error;', rpc);
  const remove = removal.indexOf('.remove(');
  assert.ok(guard > rpc && guard < remove, 'the error is thrown before anything is deleted');
});

test('signed photo URLs stay short-lived', () => {
  // A signed URL is a bearer token: it keeps working until it expires, whatever
  // happens to the block list behind it. Stretching it to four hours to spare
  // people a stale picture handed a blocked person four hours of access — the
  // same hole that was just closed for voice messages. The number moved to
  // src/lib/signedUrlLifetime.ts, where every bucket reads the same one; this
  // file only insists that nothing here signs its own.
  assert.match(source, /createSignedUrl\(path, SIGNED_URL_SECONDS\)/);
  assert.doesNotMatch(source, /createSignedUrl\([^,]+,\s*\d/);
});

test('the media library throws codes, not English sentences', () => {
  // These reach a screen that speaks fifteen languages.
  assert.match(source, /binder\/photo-too-large/);
  assert.doesNotMatch(source, /Choose another photo/);
  assert.doesNotMatch(source, /could not register the prepared profile photo/);
});

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

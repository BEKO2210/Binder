import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { bytesEqual, fromHex, hmacSha256, toHex } from '../src/lib/hmac.ts';

const sha256 = async (data: Uint8Array) => new Uint8Array(createHash('sha256').update(data).digest());
const reference = (key: Uint8Array, message: Uint8Array) => createHmac('sha256', key).update(message).digest('hex');

test('the tag matches what every other HMAC-SHA256 produces', async () => {
  // RFC 4231, case 1 and case 2 — and then node's own, which is the point:
  // an implementation nobody can check against is not an implementation.
  const key = new Uint8Array(20).fill(0x0b);
  const message = new TextEncoder().encode('Hi There');
  assert.equal(toHex(await hmacSha256(sha256, key, message)), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');

  const jefe = new TextEncoder().encode('Jefe');
  const question = new TextEncoder().encode('what do ya want for nothing?');
  assert.equal(toHex(await hmacSha256(sha256, jefe, question)), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

test('a key longer than a block is hashed first, like everybody else does it', async () => {
  const key = new Uint8Array(200).fill(0xaa);
  const message = new TextEncoder().encode('Test Using Larger Than Block-Size Key - Hash Key First');
  assert.equal(toHex(await hmacSha256(sha256, key, message)), reference(key, message));
});

test('the same ciphertext under a different key gets a different tag', async () => {
  const message = new TextEncoder().encode('{"access_token":"…"}');
  const first = await hmacSha256(sha256, new Uint8Array(32).fill(1), message);
  const second = await hmacSha256(sha256, new Uint8Array(32).fill(2), message);
  assert.notEqual(toHex(first), toHex(second));
});

test('tags are compared without saying where they stop matching', () => {
  assert.equal(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  assert.equal(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])), false);
  assert.equal(bytesEqual(new Uint8Array(), new Uint8Array()), true);
});

test('hex survives the round trip and refuses what is not hex', () => {
  const bytes = new Uint8Array([0, 15, 16, 255]);
  assert.equal(toHex(bytes), '000f10ff');
  assert.deepEqual(fromHex('000f10ff'), bytes);
  assert.throws(() => fromHex('abc'), /not-hex/);
  assert.throws(() => fromHex('zz'), /not-hex/);
});

const store = readFileSync(new URL('../src/lib/secureSessionStorage.ts', import.meta.url), 'utf8');

test('the stored session is authenticated before it is decrypted', () => {
  // AES-CTR decrypts anything. A file truncated by a crash, or written by
  // something else, came back as a different string — a token-shaped thing
  // handed to the auth bootstrap rather than a failure.
  assert.match(store, /const expected = await hmacSha256\(sha256, material\.slice\(32\), encrypted\);/);
  const check = store.indexOf('if (!bytesEqual(expected');
  const decrypt = store.indexOf('cipher.decrypt(encrypted)');
  assert.ok(check > 0 && decrypt > check, 'the tag is checked before anything is decrypted');
});

test('encrypting and authenticating do not share a key', () => {
  assert.match(store, /const material = Crypto\.getRandomValues\(new Uint8Array\(64\)\);/);
  assert.match(store, /const encryptionKey = material\.slice\(0, 32\);/);
  assert.match(store, /const signingKey = material\.slice\(32\);/);
});

test('a session that does not authenticate signs the person out', () => {
  const getItem = store.slice(store.indexOf('async getItem'), store.indexOf('async setItem'));
  assert.match(getItem, /if \(decrypted === null\) \{[\s\S]*await this\.removeItem\(key\);[\s\S]*return null;/);
});

test('the digest is handed a typed array, not a bare buffer', () => {
  // expo-crypto's Android side takes a TypedArray and refuses an ArrayBuffer:
  // "[digest] Cannot convert '[object ArrayBuffer]' to a Kotlin type". Nothing
  // on a development machine can catch that — the module has no
  // implementation there — and the consequence on a phone was that no session
  // could be written at all, so signing in stopped at the error.
  assert.match(store, /Crypto\.digest\(Crypto\.CryptoDigestAlgorithm\.SHA256, copy\)/);
  assert.doesNotMatch(store, /Crypto\.digest\([^)]*\.buffer/);
});

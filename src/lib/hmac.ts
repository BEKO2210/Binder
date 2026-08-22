// HMAC-SHA256 over a SHA-256 the caller supplies.
//
// The session lives AES-CTR-encrypted in AsyncStorage because it is too large
// for the keystore. CTR is a stream cipher and says nothing about whether what
// it decrypted is what was written: flip a bit in the file and it hands back a
// different string, cheerfully. For a session that means a torn write or a
// tampered file comes back as a plausible-looking token rather than as a
// failure, and what happens next is anybody's guess.
//
// So the ciphertext is authenticated, and the tag is checked before anything is
// decrypted. The digest itself is native — expo-crypto on the phone, node's own
// in the tests — which is why it is a parameter and this file is pure.

export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

const BLOCK_SIZE = 64;

export async function hmacSha256(sha256: Sha256, key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const shortened = key.length > BLOCK_SIZE ? await sha256(key) : key;
  const padded = new Uint8Array(BLOCK_SIZE);
  padded.set(shortened);

  const inner = new Uint8Array(BLOCK_SIZE + message.length);
  const outerKey = new Uint8Array(BLOCK_SIZE);
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    inner[index] = (padded[index] ?? 0) ^ 0x36;
    outerKey[index] = (padded[index] ?? 0) ^ 0x5c;
  }
  inner.set(message, BLOCK_SIZE);

  const innerHash = await sha256(inner);
  const outer = new Uint8Array(BLOCK_SIZE + innerHash.length);
  outer.set(outerKey);
  outer.set(innerHash, BLOCK_SIZE);
  return sha256(outer);
}

/**
 * Compares two tags without giving away where they stop matching. A check that
 * returns early turns a forgery into a guessing game with feedback.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) throw new Error('binder/not-hex');
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

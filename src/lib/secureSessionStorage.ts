import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { bytesEqual, fromHex, hmacSha256, toHex } from './hmac';

// Supabase's documented Expo pattern: the session JSON is too large for the
// Android keystore, so the payload lives AES-CTR-encrypted in AsyncStorage
// while the per-key key material lives in expo-secure-store (hardware-backed
// keystore). Losing either side just signs the user out.
//
// With one addition. CTR is a stream cipher: it will decrypt anything, and a
// file that was truncated by a crash or edited by something else comes back as
// a different string rather than as a failure. A garbled session is worse than
// no session — it is a token-shaped thing handed to the auth bootstrap. So the
// ciphertext carries an HMAC-SHA256 tag, the tag is checked before anything is
// decrypted, and a value that does not authenticate is treated exactly like a
// value that was never there: signed out, storage cleared.
//
// The key material is 64 bytes now: 32 to encrypt with, 32 to authenticate
// with, because one key doing two jobs is how constructions like this go
// wrong. A 32-byte entry from before this change is still read — the session
// belongs to somebody who is signed in and should stay signed in — and the
// next write replaces it with the authenticated format.

const VERSION_PREFIX = 'v2';

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // A fresh buffer, because the digest signature wants one that is not shared
  // and a slice of a larger array is not guaranteed to be either.
  const copy = new Uint8Array(data.length);
  copy.set(data);
  return new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, copy.buffer as ArrayBuffer));
}

export class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const material = Crypto.getRandomValues(new Uint8Array(64));
    const encryptionKey = material.slice(0, 32);
    const signingKey = material.slice(32);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    const tag = await hmacSha256(sha256, signingKey, encrypted);
    await SecureStore.setItemAsync(key, toHex(material));
    return `${VERSION_PREFIX}.${toHex(encrypted)}.${toHex(tag)}`;
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const keyHex = await SecureStore.getItemAsync(key);
    if (!keyHex) return null;
    const material = fromHex(keyHex);
    const [prefix, cipherHex, tagHex] = value.split('.');

    if (prefix !== VERSION_PREFIX) {
      // Written before the tag existed: the whole value is the ciphertext and
      // the whole key is the encryption key. Read it so somebody who was
      // signed in stays signed in; the next write is authenticated.
      if (material.length !== 32) return null;
      const legacy = new aesjs.ModeOfOperation.ctr(material, new aesjs.Counter(1));
      return aesjs.utils.utf8.fromBytes(legacy.decrypt(fromHex(value)));
    }

    if (material.length !== 64 || !cipherHex || !tagHex) return null;
    const encrypted = fromHex(cipherHex);
    const expected = await hmacSha256(sha256, material.slice(32), encrypted);
    // Before decrypting, not after: what fails authentication is not a message.
    if (!bytesEqual(expected, fromHex(tagHex))) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(material.slice(0, 32), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(encrypted));
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    let decrypted: string | null = null;
    try {
      decrypted = await this.decrypt(key, encrypted);
    } catch {
      decrypted = null;
    }
    if (decrypted === null) {
      // Undecryptable or unauthenticated state (restored backup, cleared
      // keystore, a file somebody else wrote) — treat as signed out instead of
      // handing the auth bootstrap something shaped like a session.
      await this.removeItem(key);
      return null;
    }
    return decrypted;
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    try {
      await AsyncStorage.setItem(key, encrypted);
    } catch (error) {
      // Do not strand a new encryption key if the ciphertext could not be
      // persisted. The original storage error remains the caller's signal.
      await SecureStore.deleteItemAsync(key).catch(() => undefined);
      throw error;
    }
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

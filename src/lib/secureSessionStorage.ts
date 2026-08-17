import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Supabase's documented Expo pattern: the session JSON is too large for the
// Android keystore, so the payload lives AES-CTR-encrypted in AsyncStorage
// while the per-key 256-bit encryption key lives in expo-secure-store
// (hardware-backed keystore). Losing either side just signs the user out.
export class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = Crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encrypted);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const keyHex = await SecureStore.getItemAsync(key);
    if (!keyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
    const decrypted = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decrypted);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await this.decrypt(key, encrypted);
    } catch {
      // Undecryptable state (restored backup, cleared keystore) — treat as
      // signed out instead of crashing the auth bootstrap.
      await this.removeItem(key);
      return null;
    }
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
